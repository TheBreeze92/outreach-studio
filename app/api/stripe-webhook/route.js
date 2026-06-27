import Stripe from "stripe";
import { getAdminClient } from "../../../lib/supabaseAdmin.js";
import { addCredits } from "../../../lib/credits.js";
import { reportError } from "../../../lib/reportError.js";

const CREDITS_PER_PACK = 50;

export async function POST(req) {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !webhookSecret) {
    return Response.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const stripe = new Stripe(key);
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const userId = event.data.object.client_reference_id;
    try {
      const admin = getAdminClient();
      const { error } = await admin.from("stripe_events").insert({ event_id: event.id });
      if (error) {
        if (error.code === "23505") {
          return Response.json({ received: true, duplicate: true });
        }
        throw new Error(error.message || "Failed to record event");
      }
      if (userId) {
        await addCredits(admin, userId, CREDITS_PER_PACK);
      }
    } catch (e) {
      await reportError("stripe-webhook", e);
      return Response.json({ error: "Failed to apply credits." }, { status: 500 });
    }
  }

  return Response.json({ received: true });
}
