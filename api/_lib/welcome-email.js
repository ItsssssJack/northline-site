// Welcome email — sent immediately after lead form submit.
// Hand-written HTML (no React Email build step) — table-based for client compatibility.

const SITE_URL = process.env.SITE_URL || "https://northline-site-murex.vercel.app";

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "there";
}

function domainOf(url) {
  if (!url) return "your site";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

export function buildWelcomeEmail({ name, email, website, biggest_problem }) {
  const fname = firstName(name);
  const domain = domainOf(website);
  const dashboardUrl = `${SITE_URL}/dashboard`;
  const subject = `Got it, ${fname} — your teardown is being recorded.`;

  const quoteBlock = biggest_problem
    ? `
      <p style="font-size:13px;color:#5a5a5a;line-height:1.55;margin:18px 0 0">
        <strong>One ask before we record:</strong> you mentioned —
      </p>
      <p style="border-left:3px solid #de1d8d;background:#fafafa;padding:14px 18px;border-radius:0 8px 8px 0;margin:8px 0 0;font-size:14px;line-height:1.5;color:#3a3a3a;font-style:italic">
        "${esc(biggest_problem)}"
      </p>
      <p style="font-size:13px;color:#5a5a5a;line-height:1.55;margin:14px 0 0">
        If there's anything else you want us to look at first, hit reply. One sentence is enough.
      </p>`
    : `
      <p style="font-size:13px;color:#5a5a5a;line-height:1.55;margin:18px 0 0">
        Want us to focus on something specific? Hit reply with one sentence and we'll work it into the teardown.
      </p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;background:#f3f3f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04),0 10px 30px -10px rgba(0,0,0,.08)">
    <div style="height:4px;background:linear-gradient(90deg,#0a72ef 0%,#6d28d9 25%,#de1d8d 55%,#ff5b4f 85%,#fb923c 100%)"></div>
    <div style="padding:36px 40px">
      <div style="display:flex;align-items:center;gap:10px;font-weight:600;color:#171717;letter-spacing:-0.01em;font-size:16px">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 20 L12 4 L21 20 Z" fill="#171717"/>
          <path d="M12 4 L21 20" stroke="#fff" stroke-width="1.5"/>
        </svg>
        Northline
      </div>
      <h1 style="font-size:28px;line-height:1.15;font-weight:600;color:#171717;letter-spacing:-0.025em;margin:24px 0 12px">
        Got it, ${esc(fname)} — your teardown is being recorded.
      </h1>
      <p style="font-size:16px;line-height:1.55;color:#3a3a3a;margin:0 0 24px">
        Thanks for trusting us with <strong>${esc(domain)}</strong>. Here's exactly what happens next.
      </p>

      <div style="border:1px solid #e6e6e6;border-radius:12px;padding:8px 20px;margin:16px 0 28px">
        <div style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #f0f0f0;align-items:flex-start">
          <span style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:13px;flex:0 0 24px;background:linear-gradient(135deg,#0a72ef,#6d28d9)">✓</span>
          <div style="flex:1;min-width:0">
            <p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#7a7a7a;margin:0 0 2px">Right now</p>
            <p style="font-size:15px;line-height:1.45;color:#171717;margin:0">Your dashboard is auto-analysing ${esc(domain)} — Lighthouse scores, Core Web Vitals, SEO and meta tags. Refresh anytime.</p>
          </div>
        </div>
        <div style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #f0f0f0;align-items:flex-start">
          <span style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#7a7a7a;font-size:13px;font-weight:600;flex:0 0 24px;background:#e6e6e6">2</span>
          <div style="flex:1;min-width:0">
            <p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#7a7a7a;margin:0 0 2px">Within 48 hours</p>
            <p style="font-size:15px;line-height:1.45;color:#171717;margin:0">A growth expert records your 5-min Loom — UX, speed, copy, and exactly what we'd fix first.</p>
          </div>
        </div>
        <div style="display:flex;gap:14px;padding:14px 0;align-items:flex-start">
          <span style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#7a7a7a;font-size:13px;font-weight:600;flex:0 0 24px;background:#e6e6e6">3</span>
          <div style="flex:1;min-width:0">
            <p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#7a7a7a;margin:0 0 2px">Lands in your inbox</p>
            <p style="font-size:15px;line-height:1.45;color:#171717;margin:0">Watch it. Reply if you want us to dig deeper. No call, no upsell, no obligation.</p>
          </div>
        </div>
      </div>

      ${quoteBlock}
    </div>

    <div style="padding:0 40px 36px 40px">
      <div style="margin:28px 0 8px;text-align:center">
        <a href="${esc(dashboardUrl)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:99px;font-size:15px;font-weight:600;letter-spacing:-0.005em">Open my dashboard &rarr;</a>
      </div>
    </div>

    <div style="font-size:13px;color:#7a7a7a;line-height:1.55;padding:24px 40px 32px;border-top:1px solid #f0f0f0;background:#fafafa">
      Northline · UK · <a href="${esc(SITE_URL)}" style="color:#0a72ef;text-decoration:none">northline.studio</a><br>
      You're getting this because you requested a free 5-min teardown.<br>
      Want out? <a href="mailto:hello@northline.studio?subject=Unsubscribe%20${esc(email)}" style="color:#0a72ef;text-decoration:none">Reply with "unsubscribe"</a>.
    </div>
  </div>
</body>
</html>`;

  // Plain-text fallback (improves deliverability + accessibility)
  const text = `Got it, ${fname} — your teardown is being recorded.

Thanks for trusting us with ${domain}. Here's exactly what happens next.

[Right now]  Your dashboard is auto-analysing ${domain} — Lighthouse scores, Core Web Vitals, SEO and meta tags. Refresh anytime.

[Within 48h]  A growth expert records your 5-min Loom — UX, speed, copy, and exactly what we'd fix first.

[Inbox]  Watch it. Reply if you want us to dig deeper. No call, no upsell, no obligation.

${biggest_problem ? `You mentioned: "${biggest_problem}"\n\nIf there's anything else you want us to look at first, hit reply.\n` : `Want us to focus on something specific? Hit reply with one sentence and we'll work it into the teardown.\n`}
Open your dashboard: ${dashboardUrl}

—
Northline · UK
You're getting this because you requested a free 5-min teardown.
Unsubscribe by replying with "unsubscribe".`;

  return { subject, html, text };
}

export async function sendWelcomeEmail({ name, email, website, biggest_problem }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Northline <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping welcome email");
    return { ok: false, skipped: true };
  }

  const { subject, html, text } = buildWelcomeEmail({ name, email, website, biggest_problem });

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      html,
      text,
      reply_to: "hello@northline.studio",
      tags: [{ name: "category", value: "welcome" }]
    })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Resend welcome send failed", r.status, data);
    return { ok: false, error: data };
  }
  return { ok: true, id: data.id };
}
