# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add IP-based rate limiting, Supabase RLS on the signups table, and Slack error alerting to protect the live public app from token draining and silent failures.

**Architecture:** Edge Middleware intercepts `/api/research` requests before the route runs and blocks IPs exceeding 5 requests/hour via Upstash Redis. A shared `reportError` utility fires-and-forgets a Slack Block Kit message from the catch blocks of both API routes. Supabase RLS is applied via a one-time SQL migration with no code changes required.

**Tech Stack:** Next.js 15 App Router, `@upstash/redis`, `@upstash/ratelimit`, Slack Incoming Webhooks API, Supabase SQL editor, Vitest (unit tests)

## Global Constraints

- Node environment: Next.js 15, React 19, ES modules throughout
- No new UI changes — all changes are server-side only
- `middleware.js` must export a `config` matcher — without it, Next.js runs middleware on every route including `_next/static`
- `reportError` must never throw — it wraps its own fetch in try/catch
- `.env.local` is gitignored — never commit credentials
- Upstash rate limit key: raw IP string from `x-forwarded-for`, trimmed, first value only
- Slack payload format: Block Kit with `blocks` array (not legacy `text` field)

---

### Task 1: Install Upstash packages, configure environment, and set up test runner

**Files:**
- Modify: `package.json` — add test script and new dependencies
- Create: `vitest.config.js`
- Modify: `.env.local` — add Upstash and Slack env var placeholders

**Interfaces:**
- Produces: `npm test` command that runs Vitest; `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SLACK_ERROR_WEBHOOK_URL` available in process.env

- [ ] **Step 1: Install packages**

Run:
```bash
npm install @upstash/redis @upstash/ratelimit vitest
```

Expected output: packages added, no peer dependency errors.

- [ ] **Step 2: Add test script to package.json**

Open `package.json`. The `scripts` block currently reads:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start"
}
```

Replace with:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run"
}
```

- [ ] **Step 3: Create vitest.config.js at project root**

Create `/Users/raybrown/Desktop/outreach-studio/vitest.config.js`:
```javascript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Create Upstash account and database**

1. Go to https://console.upstash.com and sign up (free tier is sufficient)
2. Click "Create Database"
3. Name it `outreach-studio-ratelimit`, region: `us-east-1` (or closest to your Vercel region)
4. Click the database, go to "REST API" tab
5. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

- [ ] **Step 5: Add env vars to .env.local**

Open `.env.local` and append:
```
UPSTASH_REDIS_REST_URL=https://YOUR_UPSTASH_URL.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR_UPSTASH_TOKEN
SLACK_ERROR_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Replace each placeholder with real values. The Slack webhook URL comes from: Slack app settings → Incoming Webhooks → Add New Webhook to Workspace.

- [ ] **Step 6: Add env vars to Vercel dashboard**

In the Vercel project dashboard: Settings → Environment Variables. Add all three:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SLACK_ERROR_WEBHOOK_URL`

Set scope to "Production" and "Preview".

- [ ] **Step 7: Verify test runner works**

Run:
```bash
npm test
```

Expected output:
```
No test files found, exiting with code 0
```

(No tests yet — that's fine. This confirms Vitest is wired up.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "chore: install upstash packages and vitest test runner"
```

---

### Task 2: Rate limiting Edge Middleware

**Files:**
- Create: `middleware.js` (project root)

**Interfaces:**
- Consumes: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` from env
- Produces: HTTP 429 JSON response for IPs exceeding 5 req/hour; passes through all other requests to the route handler

- [ ] **Step 1: Create middleware.js at project root**

Create `/Users/raybrown/Desktop/outreach-studio/middleware.js`:
```javascript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: false,
});

export const config = {
  matcher: "/api/research",
};

export async function middleware(request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "127.0.0.1";

  const { success, limit, remaining, reset } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded — you've reached 5 generations per hour.",
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

  return NextResponse.next();
}
```

- [ ] **Step 2: Start dev server and manually test the middleware**

Run:
```bash
npm run dev
```

In a separate terminal, run this command 6 times in quick succession:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/research \
  -H "Content-Type: application/json" \
  -d '{"pdfBase64":"test"}'
```

Expected: first 5 calls return `200` or `500` (route runs). The 6th call returns `429`.

To verify the 429 body:
```bash
curl -s -X POST http://localhost:3000/api/research \
  -H "Content-Type: application/json" \
  -d '{"pdfBase64":"test"}'
```

Expected body on the 6th+ call:
```json
{"error":"Rate limit exceeded — you've reached 5 generations per hour.","retryAfter":3600}
```

Note: In local dev, the IP will be `127.0.0.1` for all requests, so all 6 calls count against the same bucket — this is correct test behaviour.

- [ ] **Step 3: Commit**

```bash
git add middleware.js
git commit -m "feat: add IP-based rate limiting on /api/research via Upstash"
```

---

### Task 3: Supabase RLS migration on signups table

**Files:**
- Create: `supabase/migrations/20260623_signups_rls.sql` (record only — also run manually in dashboard)

**Interfaces:**
- Produces: `signups` table with RLS enabled; `anon` role can INSERT, nothing else

- [ ] **Step 1: Save the migration SQL as a file**

Create `/Users/raybrown/Desktop/outreach-studio/supabase/migrations/20260623_signups_rls.sql`:
```sql
-- Enable Row Level Security on the signups table.
-- The service role key (used in /api/subscribe) bypasses RLS by design.
-- The anon key (if ever exposed) can only insert — no reads, updates, or deletes.

ALTER TABLE signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_only"
  ON signups
  FOR INSERT
  TO anon
  WITH CHECK (true);
```

- [ ] **Step 2: Run the migration in Supabase**

1. Open the Supabase dashboard → SQL Editor → New Query
2. Paste the SQL above and click Run
3. Expected output: `Success. No rows returned.`

- [ ] **Step 3: Verify RLS is active**

In the Supabase SQL Editor, run:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'signups';
```

Expected result: `rowsecurity` column shows `true`.

Then verify the policy exists:
```sql
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'signups';
```

Expected result: one row — `anon_insert_only`, `INSERT`, `{anon}`.

- [ ] **Step 4: Verify the subscribe route still works**

With the dev server running:
```bash
curl -s -X POST http://localhost:3000/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test-rls@example.com"}'
```

Expected: `{"success":true}` — the service role key bypasses RLS, inserts still work.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260623_signups_rls.sql
git commit -m "feat: enable RLS on signups table with anon insert-only policy"
```

---

### Task 4: Slack error reporting utility

**Files:**
- Create: `lib/reportError.js`
- Create: `tests/lib/reportError.test.js`

**Interfaces:**
- Produces: `reportError(route: string, error: Error | unknown): Promise<void>` — exported named function. `route` is a short label like `"research"` or `"subscribe"`. `error` is whatever was caught. Returns a resolved promise in all cases (never throws).
- Consumes: `SLACK_ERROR_WEBHOOK_URL` from `process.env`

- [ ] **Step 1: Write the failing tests**

Create `/Users/raybrown/Desktop/outreach-studio/tests/lib/reportError.test.js`:
```javascript
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { reportError } from "../../lib/reportError.js";

describe("reportError", () => {
  let originalUrl;

  beforeEach(() => {
    originalUrl = process.env.SLACK_ERROR_WEBHOOK_URL;
    process.env.SLACK_ERROR_WEBHOOK_URL = "https://hooks.slack.com/test-url";
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    process.env.SLACK_ERROR_WEBHOOK_URL = originalUrl;
    vi.restoreAllMocks();
  });

  it("posts to the Slack webhook with route name and error message", async () => {
    const error = new Error("something broke");
    await reportError("research", error);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/test-url");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.blocks[0].text.text).toBe("🔴 Error in /research");
    expect(body.blocks[1].text.text).toContain("something broke");
  });

  it("does nothing when SLACK_ERROR_WEBHOOK_URL is not set", async () => {
    delete process.env.SLACK_ERROR_WEBHOOK_URL;
    await reportError("research", new Error("silent"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not throw if fetch rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(
      reportError("research", new Error("broken"))
    ).resolves.toBeUndefined();
  });

  it("handles a non-Error object without throwing", async () => {
    await expect(
      reportError("subscribe", "string error")
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test
```

Expected: 4 tests fail with `Cannot find module '../../lib/reportError.js'`.

- [ ] **Step 3: Create lib/reportError.js**

Create `/Users/raybrown/Desktop/outreach-studio/lib/reportError.js`:
```javascript
export async function reportError(route, error) {
  if (!process.env.SLACK_ERROR_WEBHOOK_URL) return;

  const message =
    error instanceof Error ? error.message : String(error);
  const stack =
    error instanceof Error ? (error.stack ?? "No stack trace") : "No stack trace";

  const payload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🔴 Error in /${route}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Message:* ${message}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `\`\`\`${stack}\`\`\`` },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Env:* ${process.env.NODE_ENV ?? "unknown"} | *Time:* ${new Date().toUTCString()}`,
          },
        ],
      },
    ],
  };

  try {
    await fetch(process.env.SLACK_ERROR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // never surface webhook failures to callers
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test
```

Expected output:
```
✓ tests/lib/reportError.test.js (4)
  ✓ posts to the Slack webhook with route name and error message
  ✓ does nothing when SLACK_ERROR_WEBHOOK_URL is not set
  ✓ does not throw if fetch rejects
  ✓ handles a non-Error object without throwing

Test Files  1 passed (1)
Tests       4 passed (4)
```

- [ ] **Step 5: Commit**

```bash
git add lib/reportError.js tests/lib/reportError.test.js
git commit -m "feat: add Slack error reporting utility with tests"
```

---

### Task 5: Wire reportError into both API routes

**Files:**
- Modify: `app/api/research/route.js`
- Modify: `app/api/subscribe/route.js`

**Interfaces:**
- Consumes: `reportError(route: string, error: Error | unknown): Promise<void>` from `../../lib/reportError.js` (research route) and `../../../lib/reportError.js` (subscribe route)

- [ ] **Step 1: Add reportError to the research route**

Open `app/api/research/route.js`. At line 1, add the import after the existing blank line (there are no existing imports at the top — this is the first import):

Add as the very first line:
```javascript
import { reportError } from "../../lib/reportError.js";
```

Then find the catch block at the bottom of the file (lines 141–146):
```javascript
  } catch (e) {
    const msg = e.name === "AbortError"
      ? "Research timed out — please try again."
      : e.message || "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
```

Replace with:
```javascript
  } catch (e) {
    await reportError("research", e);
    const msg = e.name === "AbortError"
      ? "Research timed out — please try again."
      : e.message || "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
```

- [ ] **Step 2: Add reportError to the subscribe route**

Open `app/api/subscribe/route.js`. Add import as the second line (after the existing supabase import):
```javascript
import { reportError } from "../../../lib/reportError.js";
```

The current file starts with:
```javascript
import { createClient } from '@supabase/supabase-js';
```

Make it:
```javascript
import { createClient } from '@supabase/supabase-js';
import { reportError } from "../../../lib/reportError.js";
```

Then find the catch block at lines 31–33:
```javascript
  } catch (err) {
    return Response.json({ error: err.message || "Failed to subscribe." }, { status: 500 });
  }
```

Replace with:
```javascript
  } catch (err) {
    await reportError("subscribe", err);
    return Response.json({ error: err.message || "Failed to subscribe." }, { status: 500 });
  }
```

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: 4 tests pass, same as before.

- [ ] **Step 4: Manual smoke test — trigger an error and verify Slack fires**

With the dev server running, temporarily force an error by calling the research route with a malformed payload (missing `pdfBase64` will cause the Anthropic call to fail). If `SLACK_ERROR_WEBHOOK_URL` is set in `.env.local`, you should see a Slack message appear in your configured channel within a few seconds.

- [ ] **Step 5: Commit**

```bash
git add app/api/research/route.js app/api/subscribe/route.js
git commit -m "feat: wire Slack error reporting into both API routes"
```

---

## Self-Review

**Spec coverage:**
- ✅ Rate limiting on `/api/research`, IP-based, 5/hour sliding window → Task 2
- ✅ 429 response with `error` and `retryAfter` fields → Task 2
- ✅ Upstash Redis → Tasks 1 + 2
- ✅ Supabase RLS on `signups` table, anon insert-only → Task 3
- ✅ Slack error reporting, 500s and timeouts captured → Tasks 4 + 5
- ✅ Does not interrupt user-facing error responses → `await reportError` called before return, never throws
- ✅ Stack traces in alerts → `lib/reportError.js` includes `error.stack`
- ✅ No RLS on non-existent tables → explicitly out of scope

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" references. All code blocks are complete.

**Type consistency:** `reportError(route, error)` — same signature in definition (Task 4) and both call sites (Task 5). Import path depth is correct: research route is two levels deep (`../../lib/`), subscribe route is three levels deep (`../../../lib/`).
