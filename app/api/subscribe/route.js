import { createClient } from '@supabase/supabase-js';
import { reportError } from "../../../lib/reportError.js";

export async function POST(req) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const { error } = await supabase
      .from('signups')
      .insert([{ email, created_at: new Date().toISOString() }]);

    if (error) {
      if (error.code === "23505") {
        return Response.json({ success: true });
      }
      throw error;
    }

    if (process.env.SLACK_SIGNUP_WEBHOOK_URL) {
      fetch(process.env.SLACK_SIGNUP_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: [
            {
              type: "header",
              text: { type: "plain_text", text: "🟢 New signup on Cold Outreach Studio" },
            },
            {
              type: "section",
              text: { type: "mrkdwn", text: `*Email:* ${email}\n*Time:* ${new Date().toUTCString()}` },
            },
          ],
        }),
      }).catch(() => {});
    }

    return Response.json({ success: true });
  } catch (err) {
    await reportError("subscribe", err);
    return Response.json({ error: err.message || "Failed to subscribe." }, { status: 500 });
  }
}