import Stripe from "stripe";
import { getUser } from "../../../lib/supabaseServer.js";
import { reportError } from "../../../lib/reportError.js";

export async function POST() {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: "Please sign in first." }, { status: 401 });
    }

    const key = process.env.STRIPE_SECRET_KEY;
    const price = process.env.STRIPE_PRICE_ID;
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (!key || !price) {
      return Response.json({ error: "Payments are temporarily unavailable." }, { status: 500 });
    }

    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: `${site}/?paid=1`,
      cancel_url: `${site}/`,
    });

    return Response.json({ url: session.url });
  } catch (e) {
    await reportError("checkout", e);
    return Response.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
