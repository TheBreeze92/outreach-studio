import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

export const config = { matcher: "/api/research" };

let ratelimit;
try {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    analytics: false,
  });
} catch {
  // Upstash unavailable — requests will pass through without rate limiting
}

export async function middleware(request) {
  if (ratelimit) {
    try {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        "127.0.0.1";
      const { success, limit, remaining, reset } = await ratelimit.limit(ip);
      if (!success) {
        return NextResponse.json(
          {
            error:
              "Rate limit exceeded — you've reached 5 generations per hour.",
            retryAfter: Math.ceil((reset - Date.now()) / 1000),
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": String(limit),
              "X-RateLimit-Remaining": String(remaining),
              "X-RateLimit-Reset": String(reset),
            },
          }
        );
      }
    } catch (e) {
      const webhookUrl = process.env.SLACK_ERROR_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blocks: [
              { type: "header", text: { type: "plain_text", text: "🟡 Cold Outreach Studio — Rate limiting is down" } },
              { type: "section", text: { type: "mrkdwn", text: `*Feature:* Rate limiting (Upstash Redis)\n*Time:* ${new Date().toUTCString()}\n\nUpstash is unreachable. Requests are passing through without rate limiting. No user impact, but the 5/hour cap is not being enforced.\n\n*Error:* ${e?.message ?? String(e)}` } },
            ],
          }),
        }).catch(() => {});
      }
    }
  }
  return NextResponse.next();
}
