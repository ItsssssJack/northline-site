import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-09-30.clover"
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE_URL = process.env.SITE_URL || "https://northline-site-murex.vercel.app";

async function getUserAndCustomerId(jwt) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` }
  });
  if (!userRes.ok) return { user: null, customerId: null };
  const user = await userRes.json();
  if (!user?.id) return { user: null, customerId: null };

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=stripe_customer_id`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } }
  );
  const rows = await profRes.json().catch(() => []);
  return { user, customerId: rows?.[0]?.stripe_customer_id || null };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!jwt) return res.status(401).json({ error: "Missing token" });

  try {
    const { user, customerId } = await getUserAndCustomerId(jwt);
    if (!user) return res.status(401).json({ error: "Invalid session" });
    if (!customerId) return res.status(400).json({ error: "No active subscription found" });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${SITE_URL}/dashboard`
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("portal error", err);
    return res.status(500).json({ error: err.message || "Portal session failed" });
  }
}
