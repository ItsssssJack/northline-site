import * as cheerio from "cheerio";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PSI_API_KEY = process.env.PSI_API_KEY || ""; // optional; works without

const PS_CATEGORIES = ["performance", "accessibility", "seo", "best-practices"];
const PSI_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

function fail(res, msg, code = 400, extra = {}) {
  res.status(code).json({ ok: false, error: msg, ...extra });
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return null; }
}

function normalizeUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try { return new URL(withProto); } catch { return null; }
}

function scoreOf(cat) {
  if (!cat || cat.score == null) return null;
  return Math.round(cat.score * 100);
}
function numAudit(a) {
  if (!a || a.numericValue == null) return null;
  return Math.round(a.numericValue);
}

async function runPageSpeed(url, strategy) {
  const params = new URLSearchParams();
  params.set("url", url);
  params.set("strategy", strategy);
  PS_CATEGORIES.forEach((c) => params.append("category", c));
  if (PSI_API_KEY) params.set("key", PSI_API_KEY);

  const ctrl = AbortSignal.timeout(50000);
  const r = await fetch(`${PSI_BASE}?${params}`, { signal: ctrl, headers: { Accept: "application/json" } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`PageSpeed ${strategy} ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  const lh = data.lighthouseResult || {};
  const cats = lh.categories || {};
  const audits = lh.audits || {};
  return {
    perf: scoreOf(cats.performance),
    a11y: scoreOf(cats.accessibility),
    seo: scoreOf(cats.seo),
    best: scoreOf(cats["best-practices"]),
    lcp_ms: numAudit(audits["largest-contentful-paint"]),
    cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    inp_ms: numAudit(audits["interaction-to-next-paint"]) ?? numAudit(audits["experimental-interaction-to-next-paint"]),
    tbt_ms: numAudit(audits["total-blocking-time"]),
    fcp_ms: numAudit(audits["first-contentful-paint"]),
    si_ms: numAudit(audits["speed-index"]),
    final_url: lh.finalUrl || lh.finalDisplayedUrl || url,
  };
}

async function fetchAndParse(url) {
  const ctrl = AbortSignal.timeout(15000);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl,
      redirect: "follow",
      headers: { "User-Agent": "NorthlineBot/1.0 (+https://northline.studio)" },
    });
  } catch (e) {
    return { fetch_error: String(e?.message || e) };
  }

  const html = await res.text().catch(() => "");
  const $ = cheerio.load(html);
  const headers = res.headers;

  const meta = (name, attr = "name") => $(`meta[${attr}="${name}" i]`).attr("content") || null;

  const schemaTypes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text();
    try {
      const json = JSON.parse(text);
      const collect = (obj) => {
        if (!obj || typeof obj !== "object") return;
        const t = obj["@type"];
        if (t) {
          if (Array.isArray(t)) schemaTypes.push(...t);
          else schemaTypes.push(t);
        }
        if (Array.isArray(obj["@graph"])) obj["@graph"].forEach(collect);
      };
      if (Array.isArray(json)) json.forEach(collect);
      else collect(json);
    } catch {}
  });

  const u = new URL(url);
  const [robotsRes, sitemapRes] = await Promise.allSettled([
    fetch(`${u.origin}/robots.txt`, { method: "GET", signal: AbortSignal.timeout(5000) }),
    fetch(`${u.origin}/sitemap.xml`, { method: "GET", signal: AbortSignal.timeout(5000) }),
  ]);

  return {
    title: $("title").first().text().trim() || null,
    description: meta("description") || null,
    canonical: $('link[rel="canonical"]').attr("href") || null,
    og_title: meta("og:title", "property") || null,
    og_description: meta("og:description", "property") || null,
    og_image: meta("og:image", "property") || null,
    twitter_card: meta("twitter:card") || null,
    h1_count: $("h1").length,
    h1_first: $("h1").first().text().trim().slice(0, 200) || null,
    schema_types: schemaTypes.length ? [...new Set(schemaTypes)] : null,
    has_robots: robotsRes.status === "fulfilled" && robotsRes.value.ok,
    has_sitemap: sitemapRes.status === "fulfilled" && sitemapRes.value.ok,
    hsts_set: !!headers.get("strict-transport-security"),
    csp_set: !!headers.get("content-security-policy"),
    x_frame_options: headers.get("x-frame-options") || null,
    server: headers.get("server") || null,
    final_status: res.status,
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, "Method not allowed", 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return fail(res, "Server misconfigured", 500);

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return fail(res, "Missing auth", 401);

  // Validate token + get the user
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return fail(res, "Invalid auth", 401);
  const user = await userRes.json();
  if (!user?.id) return fail(res, "Invalid auth", 401);

  const body = await readBody(req);
  if (!body) return fail(res, "Invalid body");

  // Determine URL to analyze: body.url override → profile.website
  let urlObj = normalizeUrl(body.url);
  if (!urlObj) {
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=website`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (profRes.ok) {
      const rows = await profRes.json();
      urlObj = normalizeUrl(rows?.[0]?.website);
    }
  }
  if (!urlObj) return fail(res, "No URL to analyze. Add your site to your profile or pass `url`.", 400);
  const url = urlObj.toString();

  // Run all three in parallel (each best-effort)
  const [psM, psD, page] = await Promise.allSettled([
    runPageSpeed(url, "mobile"),
    runPageSpeed(url, "desktop"),
    fetchAndParse(url),
  ]);

  const m = psM.status === "fulfilled" ? psM.value : { _error: String(psM.reason?.message || psM.reason || "") };
  const d = psD.status === "fulfilled" ? psD.value : { _error: String(psD.reason?.message || psD.reason || "") };
  const h = page.status === "fulfilled" ? page.value : { _error: String(page.reason?.message || page.reason || "") };

  const row = {
    user_id: user.id,
    url,
    status: "completed",
    perf_mobile: m.perf ?? null,
    a11y_mobile: m.a11y ?? null,
    seo_mobile: m.seo ?? null,
    best_mobile: m.best ?? null,
    perf_desktop: d.perf ?? null,
    a11y_desktop: d.a11y ?? null,
    seo_desktop: d.seo ?? null,
    best_desktop: d.best ?? null,
    lcp_ms: m.lcp_ms ?? null,
    cls: m.cls ?? null,
    inp_ms: m.inp_ms ?? null,
    tbt_ms: m.tbt_ms ?? null,
    fcp_ms: m.fcp_ms ?? null,
    si_ms: m.si_ms ?? null,
    meta_title: h.title ?? null,
    meta_description: h.description ?? null,
    meta_canonical: h.canonical ?? null,
    og_title: h.og_title ?? null,
    og_description: h.og_description ?? null,
    og_image: h.og_image ?? null,
    twitter_card: h.twitter_card ?? null,
    h1_count: h.h1_count ?? null,
    h1_first: h.h1_first ?? null,
    schema_types: h.schema_types ?? null,
    has_robots: h.has_robots ?? null,
    has_sitemap: h.has_sitemap ?? null,
    is_https: urlObj.protocol === "https:",
    hsts_set: h.hsts_set ?? null,
    csp_set: h.csp_set ?? null,
    x_frame_options: h.x_frame_options ?? null,
    server: h.server ?? null,
    raw: { mobile: m, desktop: d, page: h, ran_at: new Date().toISOString() },
  };

  const ins = await fetch(`${SUPABASE_URL}/rest/v1/site_analyses`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!ins.ok) {
    const errText = await ins.text().catch(() => "");
    console.error("Insert site_analyses failed", ins.status, errText);
    return fail(res, "Failed to save analysis", 500, { detail: errText.slice(0, 500) });
  }

  const [inserted] = await ins.json();
  return res.status(200).json({ ok: true, analysis: inserted });
}
