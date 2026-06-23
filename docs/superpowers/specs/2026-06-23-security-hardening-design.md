# Security Hardening Design — Cold Outreach Studio
**Date:** 2026-06-23
**Status:** Approved for implementation

## Context

Cold Outreach Studio is in public validation phase — no login required, anyone with the URL can use it. The app has one expensive endpoint (`/api/research`) that calls the Anthropic API (costs money per use) and one cheap endpoint (`/api/subscribe`) that logs email signups to Supabase. There is currently no rate limiting, no database-level access control, and no error alerting.

This spec covers three targeted security improvements scoped strictly to what is live and exposed today.

---

## Task 1 — Rate Limiting (The Bouncer)

### Problem
The `/api/research` endpoint is unprotected. Any script can call it thousands of times, draining the Anthropic API budget with no limit.

### Solution
Install Next.js Edge Middleware at the project root (`middleware.js`) that intercepts every request to `/api/research` before it reaches the route handler. It checks the caller's IP address against a counter stored in Upstash Redis.

**Limit:** 5 requests per IP per hour, sliding window algorithm.

**Why 5:** Generous enough for a real user or mentor testing the tool in one session. Tight enough to block any automated script.

**On breach:** Return HTTP 429 with a JSON body:
```json
{
  "error": "Rate limit exceeded — you've reached 5 generations per hour.",
  "retryAfter": 3600
}
```

**Scope:** `/api/research` only. `/api/subscribe` is excluded — it's a cheap database write with no API cost.

**IP source:** `x-forwarded-for` header (Vercel's standard), fallback to `127.0.0.1` in local development.

### New dependencies
- `@upstash/redis`
- `@upstash/ratelimit`

### New environment variables
- `UPSTASH_REDIS_REST_URL` — from Upstash dashboard
- `UPSTASH_REDIS_REST_TOKEN` — from Upstash dashboard

### Files changed
- **New:** `middleware.js` (project root)
- **No changes** to `app/api/research/route.js`

---

## Task 2 — Supabase Row Level Security (The Filing Cabinet Lock)

### Problem
The `signups` table in Supabase has no access policies. With the right credentials, someone could read, modify, or delete the entire signup list.

### Solution
Enable Row Level Security (RLS) on the `signups` table and add a single policy: the anonymous database role may only INSERT. All reads, updates, and deletes from outside the server are silently blocked at the database layer.

The `/api/subscribe` route uses the service role key, which bypasses RLS by design — inserts from the server continue to work exactly as before. No code changes required.

### SQL migration (run once in Supabase SQL editor)
```sql
ALTER TABLE signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_only"
  ON signups
  FOR INSERT
  TO anon
  WITH CHECK (true);
```

### Files changed
- **None** — SQL run directly in Supabase dashboard
- No changes to `app/api/subscribe/route.js`

---

## Task 3 — Error Telemetry (The Smoke Alarm)

### Problem
Errors in both API routes fail silently. There is no way to know the app is broken unless a user reports it.

### Solution
Create a shared utility `lib/reportError.js` that fires a formatted Slack message whenever a serious error occurs. It is called from the `catch` blocks of both API routes. It fires and forgets — it does not delay or alter the error response the user sees.

**Each Slack alert contains:**
- Which route broke (`research` or `subscribe`)
- The error message
- The stack trace
- UTC timestamp
- Environment (`production` or `development`)

**Format:** Slack Block Kit — a red header, monospace code block for the stack trace, context footer with timestamp.

**Failure safety:** The `reportError` function wraps itself in a try/catch. A broken or missing webhook URL will never surface as a user-facing error.

### New environment variable
- `SLACK_ERROR_WEBHOOK_URL` — Incoming Webhook URL from Slack app settings

### Files changed
- **New:** `lib/reportError.js`
- **Modified:** `app/api/research/route.js` — add `reportError` call in catch block
- **Modified:** `app/api/subscribe/route.js` — add `reportError` call in catch block

---

## What is explicitly out of scope

- Supabase Auth / login walls — deferred until post-validation phase
- RLS on `organizations`, `users`, `prospecData` tables — these don't exist yet
- Sentry or full observability platform — deferred until post-launch
- Rate limiting on `/api/subscribe` — not needed, no API cost exposure

---

## Env vars summary (all added to Vercel dashboard + `.env.local`)

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis endpoint for rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `SLACK_ERROR_WEBHOOK_URL` | Slack incoming webhook for error alerts |
