import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-09-30.clover"
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PRICE_ID = process.env.STRIPE_PRICE_PREMIUM;
const SITE_URL = process.env.SITE_URL || "https://northline-site-murex.vercel.app";

// Uses the caller's JWT — RLS guarantees we can only read the caller's own row.
async function getUserAndProfile(jwt) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` }
  });
  if (!userRes.ok) return { user: null, profile: null };
  const user = await userRes.json();
  if (!user?.id) return { user: null, profile: null };

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,email,full_name,stripe_customer_id`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } }
  );
  const rows = await profRes.json().catch(() => []);
  return { user, profile: Array.isArray(rows) ? rows[0] : null };
}

// Find existing Stripe customer by email so we don't duplicate on cancelled checkouts.
async function findOrCreateCustomer(user, profile) {
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const existing = await stripe.customers.list({ email: user.email, limit: 1 });
  if (existing.data[0]) {
    // Backfill the supabase_user_id metadata in case it's an older record.
    if (existing.data[0].metadata?.supabase_user_id !== user.id) {
      await stripe.customers.update(existing.data[0].id, {
        metadata: { ...(existing.data[0].metadata || {}), supabase_user_id: user.id }
      });
    }
    return existing.data[0].id;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: profile?.full_name || user.user_metadata?.full_name || undefined,
    metadata: { supabase_user_id: user.id }
  });
  return customer.id;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!jwt) return res.status(401).json({ error: "Missing token" });

  try {
    const { user, profile } = await getUserAndProfile(jwt);
    if (!user) return res.status(401).json({ error: "Invalid session" });

    const customerId = await findOrCreateCustomer(user, profile);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${SITE_URL}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/dashboard?upgrade=cancelled`,
      subscription_data: {
        metadata: { supabase_user_id: user.id }
      },
      client_reference_id: user.id
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("checkout error", err);
    return res.status(500).json({ error: err.message || "Checkout failed" });
  }
}
