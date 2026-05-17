import { sendWelcomeEmail } from "./_lib/welcome-email.js";

const INCOME_RANGES = new Set([
  "lt_1k_mo",
  "1k_10k_mo",
  "10k_100k_mo",
  "100k_1m_mo",
  "1m_plus_mo",
]);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function bad(res, msg, code = 400) {
  res.status(code).json({ ok: false, error: msg });
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return bad(res, "Method not allowed", 405);
  }

  const body = await readBody(req);
  if (!body || typeof body !== "object") return bad(res, "Invalid body");

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const website = String(body.website || "").trim();
  const income_range = String(body.income_range || "").trim();
  const biggest_problem = String(body.biggest_problem || "").trim();

  if (name.length < 1 || name.length > 120) return bad(res, "Invalid name");
  if (!EMAIL_RE.test(email) || email.length > 320) return bad(res, "Invalid email");
  if (website && website.length > 500) return bad(res, "Invalid website");
  if (!INCOME_RANGES.has(income_range)) return bad(res, "Invalid income range");
  if (biggest_problem.length < 1 || biggest_problem.length > 2000) return bad(res, "Invalid problem");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY;
  const BEEHIIV_PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Missing Supabase env vars");
    return bad(res, "Server misconfigured", 500);
  }

  const userAgent = String(req.headers["user-agent"] || "").slice(0, 500);
  const referrer = String(req.headers["referer"] || body.referrer || "").slice(0, 500);

  // 1) Persist to Supabase (source of truth)
  try {
    const sb = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        name,
        email,
        website: website || null,
        income_range,
        biggest_problem,
        source: "northline.studio",
        user_agent: userAgent,
        referrer,
      }),
    });
    if (!sb.ok) {
      const t = await sb.text().catch(() => "");
      console.error("Supabase insert failed", sb.status, t);
      return bad(res, "Could not save lead", 500);
    }
  } catch (e) {
    console.error("Supabase error", e);
    return bad(res, "Could not save lead", 500);
  }

  // 2) Subscribe to Beehiiv (best-effort — Supabase row already persisted)
  let beehiivStatus = "skipped";
  if (BEEHIIV_API_KEY && BEEHIIV_PUBLICATION_ID) {
    try {
      const bh = await fetch(
        `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${BEEHIIV_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            reactivate_existing: true,
            send_welcome_email: false,
            double_opt_override: "on",
            utm_source: "northline.studio",
            utm_medium: "website",
            utm_campaign: "teardown",
            referring_site: referrer || "https://northline.studio",
            custom_fields: [
              { name: "name", value: name },
              { name: "lead_source", value: "northline-teardown" },
              { name: "website", value: website || "" },
              { name: "income_range", value: income_range },
              { name: "biggest_problem", value: biggest_problem.slice(0, 500) },
            ],
          }),
        }
      );
      if (bh.ok) {
        beehiivStatus = "subscribed";
      } else {
        const t = await bh.text().catch(() => "");
        console.error("Beehiiv subscribe failed", bh.status, t);
        beehiivStatus = `error_${bh.status}`;
      }
    } catch (e) {
      console.error("Beehiiv error", e);
      beehiivStatus = "error_network";
    }
  }

  // 3) Send welcome email via Resend (best-effort — fire-and-forget, don't fail the signup)
  let emailStatus = "skipped";
  try {
    const result = await sendWelcomeEmail({ name, email, website, biggest_problem });
    emailStatus = result.ok ? "sent" : (result.skipped ? "skipped" : "error");
  } catch (e) {
    console.error("Welcome email error", e);
    emailStatus = "error_network";
  }

  return res.status(200).json({ ok: true, beehiiv: beehiivStatus, welcome_email: emailStatus });
}
