# Accounts + Credits + Stripe Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free email-gate with real magic-link accounts that get 3 free generations, then must buy a $49 / 50-credit pack (Stripe) to keep generating.

**Architecture:** Supabase Auth (magic link) identifies every user. A `user_credits` row per user tracks `free_used` and `paid_credits`, mutated only by service-role code through atomic Postgres functions. `/api/research` checks the balance before doing AI work and consumes one credit only on success. A Stripe Checkout Session stamped with `user_id` plus a signature-verified webhook tops up credits.

**Tech Stack:** Next.js 15.1.9 (App Router), React 19, `@supabase/ssr` + `@supabase/supabase-js` (already installed), `stripe` (new), Vitest (node environment).

## Global Constraints

- Next.js **15.1.9**, React **19** — App Router route handlers; `cookies()` from `next/headers` is **async** (must `await`).
- AI model id stays **`claude-sonnet-4-6`** — do not change the research prompt or provider-fallback logic.
- Pricing: **$49** for **50 credits** per pack; **3** free generations per account; free pool consumed before paid; packs stack; no expiry.
- A credit is consumed **only after a successful generation**; failed/timed-out generations cost nothing.
- All `user_credits` / `stripe_events` writes go through the **service-role** client; users may only `select` their own credits (RLS).
- Tests: Vitest, `environment: "node"`, mock `global.fetch` / injected clients — match the style in `tests/api/research.test.js`. No React component tests (no testing-library installed); UI task is verified by `npm run build` + a manual script.
- New env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.

---

## File Structure

- `supabase/migrations/20260626_credits.sql` — **create**: tables + RLS + RPC functions.
- `lib/credits.js` — **create**: credit logic over an injected admin client (`getBalance`, `consumeCredit`, `addCredits`).
- `lib/supabaseAdmin.js` — **create**: service-role client factory.
- `lib/supabaseServer.js` — **create**: cookie-bound server client + `getUser()`.
- `lib/supabaseBrowser.js` — **create**: browser client factory (client-side auth).
- `app/auth/callback/route.js` — **create**: exchange magic-link code for a session.
- `app/api/research/route.js` — **modify**: gate on auth + credits, consume on success.
- `app/api/checkout/route.js` — **create**: create Stripe Checkout Session.
- `app/api/stripe-webhook/route.js` — **create**: verify signature, idempotently add credits.
- `app/api/credits/route.js` — **create**: return the signed-in user's balance.
- `components/App.js` — **modify**: magic-link sign-in, balance display, paywall card, post-checkout refresh.
- `.env.example` — **modify**: add the five new vars.
- `package.json` — **modify**: add `stripe`.
- Tests under `tests/lib/` and `tests/api/` mirroring the above.

---

### Task 1: Database migration — tables, RLS, and atomic credit functions

**Files:**
- Create: `supabase/migrations/20260626_credits.sql`

**Interfaces:**
- Produces (called by later tasks via `admin.rpc(...)`):
  - `get_or_create_credits(uid uuid) returns user_credits` — upserts an empty row, returns it.
  - `consume_credit(uid uuid) returns boolean` — atomically takes one free credit (if `free_used < 3`) else one paid credit (if `paid_credits > 0`); returns whether one was taken.
  - `add_credits(uid uuid, amount int) returns void` — upserts and increments `paid_credits`.
- Tables: `user_credits(user_id, free_used, paid_credits, updated_at)`, `stripe_events(event_id, created_at)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260626_credits.sql`:

```sql
-- Per-user credit ledger
create table if not exists user_credits (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  free_used    int         not null default 0,
  paid_credits int         not null default 0,
  updated_at   timestamptz not null default now()
);

alter table user_credits enable row level security;

-- Users may read only their own row; all writes go through the service role.
drop policy if exists "read own credits" on user_credits;
create policy "read own credits" on user_credits
  for select using (auth.uid() = user_id);

-- Webhook idempotency log (service-role only; RLS on with no policies = no client access)
create table if not exists stripe_events (
  event_id   text        primary key,
  created_at timestamptz not null default now()
);
alter table stripe_events enable row level security;

-- Returns the caller's credit row, creating an empty one if needed.
create or replace function get_or_create_credits(uid uuid)
returns user_credits
language plpgsql
security definer
as $$
declare
  result user_credits;
begin
  insert into user_credits (user_id) values (uid)
    on conflict (user_id) do nothing;
  select * into result from user_credits where user_id = uid;
  return result;
end;
$$;

-- Atomically consume one credit: free pool first, then paid. Returns true if consumed.
create or replace function consume_credit(uid uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  insert into user_credits (user_id) values (uid)
    on conflict (user_id) do nothing;

  update user_credits
    set free_used = free_used + 1, updated_at = now()
    where user_id = uid and free_used < 3;
  if found then
    return true;
  end if;

  update user_credits
    set paid_credits = paid_credits - 1, updated_at = now()
    where user_id = uid and paid_credits > 0;
  if found then
    return true;
  end if;

  return false;
end;
$$;

-- Add purchased credits (idempotency handled by the webhook caller).
create or replace function add_credits(uid uuid, amount int)
returns void
language plpgsql
security definer
as $$
begin
  insert into user_credits (user_id, paid_credits) values (uid, amount)
    on conflict (user_id) do update
      set paid_credits = user_credits.paid_credits + amount, updated_at = now();
end;
$$;
```

- [ ] **Step 2: Apply and sanity-check against Supabase**

Run the migration in the Supabase SQL editor (or `supabase db push` if the CLI is linked). Then verify the functions exist and behave:

```sql
select consume_credit('00000000-0000-0000-0000-000000000001');  -- expect: true (1st free)
select consume_credit('00000000-0000-0000-0000-000000000001');  -- true (2nd)
select consume_credit('00000000-0000-0000-0000-000000000001');  -- true (3rd)
select consume_credit('00000000-0000-0000-0000-000000000001');  -- expect: false (free gone, no paid)
select add_credits('00000000-0000-0000-0000-000000000001', 50);
select consume_credit('00000000-0000-0000-0000-000000000001');  -- expect: true (paid)
select free_used, paid_credits from user_credits
  where user_id = '00000000-0000-0000-0000-000000000001';        -- expect: 3, 49
delete from user_credits where user_id = '00000000-0000-0000-0000-000000000001';  -- cleanup
```

Expected: the booleans match the comments and the final row reads `free_used = 3, paid_credits = 49`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260626_credits.sql
git commit -m "feat: add user_credits + stripe_events schema and credit functions"
```

---

### Task 2: Credits library

**Files:**
- Create: `lib/credits.js`
- Test: `tests/lib/credits.test.js`

**Interfaces:**
- Consumes: an injected Supabase client exposing `rpc(name, params)` returning `{ data, error }` (Task 1's functions).
- Produces:
  - `FREE_LIMIT` (number, `3`).
  - `getBalance(admin, userId) -> Promise<{ free_remaining: number, paid_credits: number }>`.
  - `consumeCredit(admin, userId) -> Promise<boolean>`.
  - `addCredits(admin, userId, amount) -> Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/credits.test.js`:

```js
import { vi, describe, it, expect } from "vitest";
import { FREE_LIMIT, getBalance, consumeCredit, addCredits } from "../../lib/credits.js";

function fakeAdmin(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
}

describe("getBalance", () => {
  it("computes free_remaining from free_used and returns paid_credits", async () => {
    const admin = fakeAdmin(async () => ({
      data: { user_id: "u1", free_used: 1, paid_credits: 7 },
      error: null,
    }));
    const balance = await getBalance(admin, "u1");
    expect(balance).toEqual({ free_remaining: FREE_LIMIT - 1, paid_credits: 7 });
    expect(admin.rpc).toHaveBeenCalledWith("get_or_create_credits", { uid: "u1" });
  });

  it("never returns a negative free_remaining", async () => {
    const admin = fakeAdmin(async () => ({
      data: { free_used: 9, paid_credits: 0 },
      error: null,
    }));
    expect((await getBalance(admin, "u1")).free_remaining).toBe(0);
  });

  it("unwraps an array-shaped rpc result", async () => {
    const admin = fakeAdmin(async () => ({
      data: [{ free_used: 0, paid_credits: 0 }],
      error: null,
    }));
    expect((await getBalance(admin, "u1")).free_remaining).toBe(FREE_LIMIT);
  });

  it("throws when rpc returns an error", async () => {
    const admin = fakeAdmin(async () => ({ data: null, error: { message: "boom" } }));
    await expect(getBalance(admin, "u1")).rejects.toThrow(/boom/);
  });
});

describe("consumeCredit", () => {
  it("returns true when a credit was consumed", async () => {
    const admin = fakeAdmin(async () => ({ data: true, error: null }));
    expect(await consumeCredit(admin, "u1")).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("consume_credit", { uid: "u1" });
  });

  it("returns false when none was consumed", async () => {
    const admin = fakeAdmin(async () => ({ data: false, error: null }));
    expect(await consumeCredit(admin, "u1")).toBe(false);
  });
});

describe("addCredits", () => {
  it("calls add_credits with the amount", async () => {
    const admin = fakeAdmin(async () => ({ data: null, error: null }));
    await addCredits(admin, "u1", 50);
    expect(admin.rpc).toHaveBeenCalledWith("add_credits", { uid: "u1", amount: 50 });
  });

  it("throws when rpc returns an error", async () => {
    const admin = fakeAdmin(async () => ({ data: null, error: { message: "nope" } }));
    await expect(addCredits(admin, "u1", 50)).rejects.toThrow(/nope/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/credits.test.js`
Expected: FAIL — `Failed to resolve import "../../lib/credits.js"`.

- [ ] **Step 3: Write the implementation**

Create `lib/credits.js`:

```js
export const FREE_LIMIT = 3;

export async function getBalance(admin, userId) {
  const { data, error } = await admin.rpc("get_or_create_credits", { uid: userId });
  if (error) throw new Error(`getBalance failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  const freeUsed = row?.free_used ?? 0;
  const paidCredits = row?.paid_credits ?? 0;
  return {
    free_remaining: Math.max(0, FREE_LIMIT - freeUsed),
    paid_credits: paidCredits,
  };
}

export async function consumeCredit(admin, userId) {
  const { data, error } = await admin.rpc("consume_credit", { uid: userId });
  if (error) throw new Error(`consumeCredit failed: ${error.message}`);
  return data === true;
}

export async function addCredits(admin, userId, amount) {
  const { error } = await admin.rpc("add_credits", { uid: userId, amount });
  if (error) throw new Error(`addCredits failed: ${error.message}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/credits.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/credits.js tests/lib/credits.test.js
git commit -m "feat: add credits library over injected supabase client"
```

---

### Task 3: Supabase client helpers, browser client, and auth callback

**Files:**
- Create: `lib/supabaseAdmin.js`
- Create: `lib/supabaseServer.js`
- Create: `lib/supabaseBrowser.js`
- Create: `app/auth/callback/route.js`
- Modify: `.env.example`
- Test: `tests/lib/supabaseAdmin.test.js`

**Interfaces:**
- Produces:
  - `getAdminClient() -> SupabaseClient` (service role; throws if env missing).
  - `getServerClient() -> Promise<SupabaseClient>` (cookie-bound, anon key).
  - `getUser() -> Promise<User|null>`.
  - `getBrowserClient() -> SupabaseClient` (anon key, browser).
  - `GET /auth/callback` — exchanges `?code` for a session, redirects to `/`.

- [ ] **Step 1: Add the new env vars**

Append to `.env.example`:

```bash

# Supabase Auth — anon key is required for magic-link sign-in (client + server session)
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Public site origin — used for magic-link + Stripe redirect URLs (e.g. https://yourapp.com)
NEXT_PUBLIC_SITE_URL=

# Stripe — required for the paid credit pack
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
```

- [ ] **Step 2: Write the failing test for the admin client**

Create `tests/lib/supabaseAdmin.test.js`:

```js
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const createClient = vi.fn(() => ({ marker: "admin-client" }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { getAdminClient } from "../../lib/supabaseAdmin.js";

describe("getAdminClient", () => {
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    createClient.mockClear();
  });
  afterEach(() => { process.env = saved; });

  it("creates a client with the service role key and no session persistence", () => {
    const client = getAdminClient();
    expect(client).toEqual({ marker: "admin-client" });
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-key",
      { auth: { persistSession: false } }
    );
  });

  it("throws when env is missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getAdminClient()).toThrow(/not configured/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/supabaseAdmin.test.js`
Expected: FAIL — cannot resolve `../../lib/supabaseAdmin.js`.

- [ ] **Step 4: Write the four files**

Create `lib/supabaseAdmin.js`:

```js
import { createClient } from "@supabase/supabase-js";

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin client not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
```

Create `lib/supabaseServer.js`:

```js
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a context where cookies cannot be set — ignore
          }
        },
      },
    }
  );
}

export async function getUser() {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}
```

Create `lib/supabaseBrowser.js`:

```js
import { createBrowserClient } from "@supabase/ssr";

export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
```

Create `app/auth/callback/route.js`:

```js
import { NextResponse } from "next/server";
import { getServerClient } from "../../../lib/supabaseServer.js";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const base = process.env.NEXT_PUBLIC_SITE_URL || origin;

  if (code) {
    const supabase = await getServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${base}/`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/supabaseAdmin.test.js`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add lib/supabaseAdmin.js lib/supabaseServer.js lib/supabaseBrowser.js app/auth/callback/route.js tests/lib/supabaseAdmin.test.js .env.example
git commit -m "feat: add supabase server/admin/browser clients and magic-link callback"
```

---

### Task 4: Gate `/api/research` on auth + credits

**Files:**
- Modify: `app/api/research/route.js`
- Test: `tests/api/research.test.js`

**Interfaces:**
- Consumes: `getUser` (Task 3), `getAdminClient` (Task 3), `getBalance` + `consumeCredit` (Task 2).
- Produces: `POST` now returns `401` when signed out, `402 { paywall: true }` when out of credits, and consumes one credit after a successful generation. The provider-fallback behaviour is unchanged.

- [ ] **Step 1: Add auth + credit gating to the route**

In `app/api/research/route.js`, add imports at the top (below the existing `reportError` import):

```js
import { getUser } from "../../../lib/supabaseServer.js";
import { getAdminClient } from "../../../lib/supabaseAdmin.js";
import { getBalance, consumeCredit } from "../../../lib/credits.js";
```

In `POST`, immediately after the existing both-keys-missing guard (the block that returns the 500 "technical issue" response) and **before** the `try {`, insert:

```js
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Please sign in to generate emails." }, { status: 401 });
  }

  const admin = getAdminClient();
  const balance = await getBalance(admin, user.id);
  if (balance.free_remaining <= 0 && balance.paid_credits <= 0) {
    return Response.json(
      { error: "You've used all your credits.", paywall: true },
      { status: 402 }
    );
  }
```

Then, replace the existing success return at the end of the `try` block:

```js
    return Response.json(parsed);
```

with:

```js
    try {
      await consumeCredit(admin, user.id);
    } catch (creditErr) {
      // Never withhold a generated email over a ledger hiccup; just log it.
      reportError("consume-credit", creditErr).catch(() => {});
    }
    return Response.json(parsed);
```

- [ ] **Step 2: Update existing tests to provide a signed-in user with credit**

At the very top of `tests/api/research.test.js`, **above** the existing `import` of the route, add mock declarations and module mocks:

```js
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockGetUser = vi.fn();
const mockGetBalance = vi.fn();
const mockConsumeCredit = vi.fn();

vi.mock("../../lib/supabaseServer.js", () => ({ getUser: (...a) => mockGetUser(...a) }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ getAdminClient: () => ({}) }));
vi.mock("../../lib/credits.js", () => ({
  getBalance: (...a) => mockGetBalance(...a),
  consumeCredit: (...a) => mockConsumeCredit(...a),
}));
```

(Delete the now-duplicate `import { vi, describe, ... } from "vitest";` line that already exists so `vitest` is imported once.)

Inside the existing `describe("POST handler — provider fallback", ...)`, extend its `beforeEach` to set safe defaults (add these lines at the end of the existing `beforeEach` body):

```js
    mockGetUser.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    mockGetBalance.mockResolvedValue({ free_remaining: 3, paid_credits: 0 });
    mockConsumeCredit.mockReset();
    mockConsumeCredit.mockResolvedValue(true);
```

- [ ] **Step 3: Run the existing POST tests to verify they still pass**

Run: `npx vitest run tests/api/research.test.js`
Expected: PASS — the existing provider-fallback suite is green with the signed-in defaults.

- [ ] **Step 4: Add the new gating tests**

Append a new `describe` block to `tests/api/research.test.js`:

```js
describe("POST handler — auth + credit gating", () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    };
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GOOGLE_AI_API_KEY = "test-gemini-key";
    global.fetch = vi.fn();
    mockGetUser.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    mockGetBalance.mockResolvedValue({ free_remaining: 3, paid_credits: 0 });
    mockConsumeCredit.mockReset();
    mockConsumeCredit.mockResolvedValue(true);
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
    vi.restoreAllMocks();
  });

  function makeRequest() {
    return { json: async () => ({ pdfBase64: "dGVzdA==", senderName: "S", companyUrl: "https://x.com", productDescription: "p" }) };
  }

  function mockAnthropicSuccess() {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify({ prospect_name: "Jane" }) }] }),
    });
  }

  it("returns 401 and does no AI work when signed out", async () => {
    mockGetUser.mockResolvedValue(null);
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 402 with paywall flag when out of credits", async () => {
    mockGetBalance.mockResolvedValue({ free_remaining: 0, paid_credits: 0 });
    const response = await POST(makeRequest());
    expect(response.status).toBe(402);
    expect((await response.json()).paywall).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("consumes one credit after a successful generation", async () => {
    mockAnthropicSuccess();
    await POST(makeRequest());
    expect(mockConsumeCredit).toHaveBeenCalledTimes(1);
    expect(mockConsumeCredit).toHaveBeenCalledWith({}, "user-1");
  });

  it("does NOT consume a credit when generation fails", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "gemini error" });
    const response = await POST(makeRequest());
    expect(response.status).toBe(500);
    expect(mockConsumeCredit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run the full research suite to verify it passes**

Run: `npx vitest run tests/api/research.test.js`
Expected: PASS — provider-fallback suite plus the four new gating tests.

- [ ] **Step 6: Commit**

```bash
git add app/api/research/route.js tests/api/research.test.js
git commit -m "feat: gate /api/research on auth and consume a credit per generation"
```

---

### Task 5: Stripe Checkout route

**Files:**
- Modify: `package.json` (add `stripe`)
- Create: `app/api/checkout/route.js`
- Test: `tests/api/checkout.test.js`

**Interfaces:**
- Consumes: `getUser` (Task 3); `stripe` SDK.
- Produces: `POST /api/checkout` → `401` if signed out, else creates a Checkout Session with `client_reference_id = user.id` and returns `{ url }`.

- [ ] **Step 1: Install the Stripe SDK**

Run: `npm install stripe`
Expected: `stripe` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing tests**

Create `tests/api/checkout.test.js`:

```js
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockGetUser = vi.fn();
const mockSessionCreate = vi.fn();

vi.mock("../../lib/supabaseServer.js", () => ({ getUser: (...a) => mockGetUser(...a) }));
vi.mock("stripe", () => ({
  default: vi.fn(() => ({ checkout: { sessions: { create: (...a) => mockSessionCreate(...a) } } })),
}));

import { POST } from "../../app/api/checkout/route.js";

describe("POST /api/checkout", () => {
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRICE_ID = "price_123";
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.test";
    mockGetUser.mockReset();
    mockSessionCreate.mockReset();
  });
  afterEach(() => { process.env = saved; vi.clearAllMocks(); });

  it("returns 401 when signed out", async () => {
    mockGetUser.mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(401);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("creates a session stamped with the user id and returns its url", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/abc" });

    const response = await POST();
    expect((await response.json()).url).toBe("https://checkout.stripe.com/abc");

    const args = mockSessionCreate.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.client_reference_id).toBe("user-1");
    expect(args.customer_email).toBe("user@example.com");
    expect(args.line_items).toEqual([{ price: "price_123", quantity: 1 }]);
    expect(args.success_url).toBe("https://app.test/?paid=1");
    expect(args.cancel_url).toBe("https://app.test/");
  });

  it("returns 500 when Stripe is not configured", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1", email: "u@e.com" });
    delete process.env.STRIPE_PRICE_ID;
    const response = await POST();
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/api/checkout.test.js`
Expected: FAIL — cannot resolve `../../app/api/checkout/route.js`.

- [ ] **Step 4: Write the route**

Create `app/api/checkout/route.js`:

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/api/checkout.test.js`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add app/api/checkout/route.js tests/api/checkout.test.js package.json package-lock.json
git commit -m "feat: add Stripe checkout session route for the 50-credit pack"
```

---

### Task 6: Stripe webhook route

**Files:**
- Create: `app/api/stripe-webhook/route.js`
- Test: `tests/api/stripe-webhook.test.js`

**Interfaces:**
- Consumes: `getAdminClient` (Task 3), `addCredits` (Task 2); `stripe` SDK.
- Produces: `POST /api/stripe-webhook` — verifies signature (`400` on failure); on `checkout.session.completed`, idempotently records `event.id` and adds 50 credits to `client_reference_id`.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/stripe-webhook.test.js`:

```js
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockConstructEvent = vi.fn();
const mockAddCredits = vi.fn();
const mockInsert = vi.fn();

vi.mock("stripe", () => ({
  default: vi.fn(() => ({ webhooks: { constructEvent: (...a) => mockConstructEvent(...a) } })),
}));
vi.mock("../../lib/supabaseAdmin.js", () => ({
  getAdminClient: () => ({ from: () => ({ insert: (...a) => mockInsert(...a) }) }),
}));
vi.mock("../../lib/credits.js", () => ({ addCredits: (...a) => mockAddCredits(...a) }));

import { POST } from "../../app/api/stripe-webhook/route.js";

function makeReq() {
  return {
    headers: { get: () => "sig-header" },
    text: async () => "raw-body",
  };
}

describe("POST /api/stripe-webhook", () => {
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    mockConstructEvent.mockReset();
    mockAddCredits.mockReset().mockResolvedValue(undefined);
    mockInsert.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => { process.env = saved; vi.clearAllMocks(); });

  it("returns 400 on an invalid signature", async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error("bad sig"); });
    const response = await POST(makeReq());
    expect(response.status).toBe(400);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });

  it("adds 50 credits on checkout.session.completed", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1" } },
    });
    const response = await POST(makeReq());
    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith({ event_id: "evt_1" });
    expect(mockAddCredits).toHaveBeenCalledWith(expect.anything(), "user-1", 50);
  });

  it("is idempotent — a duplicate event adds no credits", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1" } },
    });
    mockInsert.mockResolvedValue({ error: { code: "23505" } });
    const response = await POST(makeReq());
    expect(response.status).toBe(200);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });

  it("ignores unrelated event types", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_2",
      type: "payment_intent.created",
      data: { object: {} },
    });
    const response = await POST(makeReq());
    expect(response.status).toBe(200);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/stripe-webhook.test.js`
Expected: FAIL — cannot resolve `../../app/api/stripe-webhook/route.js`.

- [ ] **Step 3: Write the route**

Create `app/api/stripe-webhook/route.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/stripe-webhook.test.js`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe-webhook/route.js tests/api/stripe-webhook.test.js
git commit -m "feat: add idempotent Stripe webhook that tops up credits"
```

---

### Task 7: Balance endpoint

**Files:**
- Create: `app/api/credits/route.js`
- Test: `tests/api/credits.test.js`

**Interfaces:**
- Consumes: `getUser` (Task 3), `getAdminClient` (Task 3), `getBalance` (Task 2).
- Produces: `GET /api/credits` → `401` if signed out, else `{ free_remaining, paid_credits }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/credits.test.js`:

```js
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockGetUser = vi.fn();
const mockGetBalance = vi.fn();

vi.mock("../../lib/supabaseServer.js", () => ({ getUser: (...a) => mockGetUser(...a) }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ getAdminClient: () => ({}) }));
vi.mock("../../lib/credits.js", () => ({ getBalance: (...a) => mockGetBalance(...a) }));

import { GET } from "../../app/api/credits/route.js";

describe("GET /api/credits", () => {
  beforeEach(() => { mockGetUser.mockReset(); mockGetBalance.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  it("returns 401 when signed out", async () => {
    mockGetUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the balance for a signed-in user", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" });
    mockGetBalance.mockResolvedValue({ free_remaining: 2, paid_credits: 50 });
    const response = await GET();
    expect(await response.json()).toEqual({ free_remaining: 2, paid_credits: 50 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/credits.test.js`
Expected: FAIL — cannot resolve `../../app/api/credits/route.js`.

- [ ] **Step 3: Write the route**

Create `app/api/credits/route.js`:

```js
import { getUser } from "../../../lib/supabaseServer.js";
import { getAdminClient } from "../../../lib/supabaseAdmin.js";
import { getBalance } from "../../../lib/credits.js";

export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const admin = getAdminClient();
  const balance = await getBalance(admin, user.id);
  return Response.json(balance);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/credits.test.js`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add app/api/credits/route.js tests/api/credits.test.js
git commit -m "feat: add GET /api/credits balance endpoint"
```

---

### Task 8: Frontend — magic-link sign-in, balance, paywall

**Files:**
- Modify: `components/App.js`

**Interfaces:**
- Consumes: `getBrowserClient` (Task 3); `GET /api/credits`; `POST /api/checkout`; `POST /api/research` (now returns `401` / `402 { paywall }`); existing `POST /api/subscribe`.
- Produces: a signed-in-gated UI with a credit counter and a paywall card. No exported interface changes.

> **Why no unit test:** there is no React testing library in this repo and the existing suite is node-only. This task is verified by `npm run build` plus the manual script in Step 6. Keep all logic in `components/App.js`; do not add a test runner.

- [ ] **Step 1: Replace the auth/session state and sign-in handler**

In `components/App.js`, add an import near the top (after the `buildGmailUrl` import):

```js
import { getBrowserClient } from "../lib/supabaseBrowser.js";
```

Replace the subscription state block:

```js
  const [isSubscribed, setIsSubscribed] = useState(process.env.NODE_ENV === "development");

  useEffect(() => {
    if (localStorage.getItem("cos_subscribed") === "1") setIsSubscribed(true);
  }, []);
```

with auth + credit state and a session listener:

```js
  const supabase = useRef(getBrowserClient()).current;
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [balance, setBalance] = useState(null);   // { free_remaining, paid_credits } | null
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  async function refreshBalance() {
    try {
      const resp = await fetch("/api/credits");
      if (resp.ok) setBalance(await resp.json());
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) refreshBalance();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) refreshBalance();
    });
    // After returning from Stripe Checkout, refresh and clean the URL.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paid") === "1") {
      refreshBalance();
      window.history.replaceState({}, "", "/");
    }
    return () => sub.subscription.unsubscribe();
  }, [supabase]);
```

- [ ] **Step 2: Replace `handleSubscribe` with a magic-link sender**

Replace the entire `handleSubscribe` function with:

```js
  async function handleSubscribe(e) {
    e.preventDefault();
    if (!subscriberEmail || !subscriberEmail.includes("@")) {
      setSubError("Please enter a valid email address.");
      return;
    }
    setSubLoading(true);
    setSubError("");
    try {
      // Keep the marketing list growing (fire-and-forget).
      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subscriberEmail }),
      }).catch(() => {});

      const { error } = await supabase.auth.signInWithOtp({
        email: subscriberEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw new Error(error.message);
      setMagicSent(true);
    } catch (err) {
      setSubError(err.message || "Could not send the sign-in link.");
    } finally {
      setSubLoading(false);
    }
  }
```

- [ ] **Step 3: Add a checkout starter and wire research responses to the paywall**

Add this function next to `generate`:

```js
  async function startCheckout() {
    setCheckoutLoading(true);
    try {
      const resp = await fetch("/api/checkout", { method: "POST" });
      const data = await resp.json();
      if (data.url) { window.location.href = data.url; return; }
      throw new Error(data.error || "Could not start checkout.");
    } catch (err) {
      setError(err.message || "Could not start checkout.");
      setCheckoutLoading(false);
    }
  }
```

In `generate`, replace the existing non-OK handling:

```js
      if (!resp.ok) {
        let msg = "Something went wrong on our end — please try again shortly.";
        try { const j = await resp.json(); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
```

with paywall- and auth-aware handling:

```js
      if (resp.status === 402) {
        setShowPaywall(true);
        return;
      }
      if (resp.status === 401) {
        setSession(null);
        throw new Error("Your session expired — please sign in again.");
      }
      if (!resp.ok) {
        let msg = "Something went wrong on our end — please try again shortly.";
        try { const j = await resp.json(); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
```

At the end of the `try` in `generate`, right after `setResult(data);`, refresh the counter:

```js
      refreshBalance();
```

- [ ] **Step 4: Update the gate JSX (sign-in instead of email-unlock) and add the counter + paywall**

Replace the gate condition `{!isSubscribed ? (` … through its matching email-gate card with a sign-in card that reacts to `authReady`, `session`, and `magicSent`. Replace:

```js
        {/* GATE */}
        {!isSubscribed ? (
```

with:

```js
        {/* GATE */}
        {!authReady ? (
          <div className="rise gate-card">
            <p className="gate-desc">Loading…</p>
          </div>
        ) : !session ? (
```

Then replace the gate card's heading/description/form copy so it reads as sign-in. Change the heading text `Unlock Access to the Studio` to `Sign in to start`, the description to `Enter your email and we'll send you a magic link — no password.`, and the button label logic `{subLoading ? "Activating..." : "Get Free Access"}` to `{subLoading ? "Sending link..." : "Email me a magic link"}`. Immediately after the `</form>` inside the gate card, add a sent-confirmation:

```js
              {magicSent && (
                <p className="gate-desc" style={{ marginTop: 12 }}>
                  ✓ Check your inbox for the sign-in link.
                </p>
              )}
```

Directly below the `<header>…</header>` block (before the gate), add a balance counter that shows once signed in:

```js
        {session && balance && (
          <div className="credit-counter">
            {balance.free_remaining > 0
              ? `${balance.free_remaining} free ${balance.free_remaining === 1 ? "email" : "emails"} left`
              : `${balance.paid_credits} ${balance.paid_credits === 1 ? "email" : "emails"} left`}
          </div>
        )}
```

- [ ] **Step 5: Render the paywall card**

Inside the signed-in branch, render the paywall when `showPaywall` is true, before the main form block. Add immediately after the `<>` that opens the signed-in branch:

```js
            {showPaywall && (
              <div className="rise gate-card">
                <h2 className="gate-heading">You've used your 3 free emails.</h2>
                <p className="gate-desc">
                  $49 → 50 more signal-researched emails. One-time, no subscription.
                </p>
                <button type="button" className="btn-primary" onClick={startCheckout} disabled={checkoutLoading}>
                  {checkoutLoading ? "Starting checkout..." : "Buy 50 emails — $49"}
                </button>
              </div>
            )}
```

And guard the main form so it hides while the paywall is shown — change the main form condition `{!result && !loading && (` to `{!result && !loading && !showPaywall && (`.

- [ ] **Step 6: Verify the build and run a manual smoke test**

Run: `npm run build`
Expected: build succeeds with no errors.

Then run `npm run dev` and manually verify (requires real Supabase Auth + Stripe **test** keys in `.env.local`, and the Task 1 migration applied):

1. Logged out → the **Sign in to start** card shows; submitting an email shows "Check your inbox".
2. Click the magic link → returns signed in; the counter shows **3 free emails left**.
3. Generate three times → counter counts down to **0**; the 4th attempt shows the **paywall card**.
4. Click **Buy 50 emails — $49** → redirected to Stripe Checkout; pay with test card `4242 4242 4242 4242`.
5. Return to `/?paid=1` → counter shows **50 emails left**; generating works again and decrements.

Expected: all five steps behave as described.

- [ ] **Step 7: Commit**

```bash
git add components/App.js
git commit -m "feat: magic-link sign-in, credit counter, and paywall in the UI"
```

---

### Task 9: Full suite + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — all suites (`buildMailtoUrl`, `reportError`, `research`, `credits`, `supabaseAdmin`, `checkout`, `stripe-webhook`, `credits` API) green.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit any final touch-ups** (only if Steps 1–2 surfaced fixes)

```bash
git add -A
git commit -m "chore: finalize accounts + credits + paywall"
```

---

## Self-Review

**Spec coverage:**
- Auth flow (magic link, `@supabase/ssr`, `/auth/callback`) → Tasks 3, 8. ✓
- `user_credits` + `stripe_events` tables + RLS → Task 1. ✓
- Generation logic (401 / 402 paywall / consume-on-success / free-before-paid) → Tasks 1 (SQL), 2 (lib), 4 (route). ✓
- Checkout session with `client_reference_id` → Task 5. ✓
- Webhook: signature verify + idempotency + +50 credits → Task 6. ✓
- Balance endpoint + header display → Tasks 7, 8. ✓
- New env vars + `stripe` dep → Tasks 3, 5. ✓
- Rate limiter unchanged (coarse guard) → untouched by design; `middleware.js` not modified. ✓
- `signups` list kept growing on sign-in → Task 8 Step 2. ✓
- Out of scope (subscriptions, email blast, headline copy) → not implemented, as specified. ✓

**Placeholder scan:** No TBD/TODO; every code and test step contains complete code. ✓

**Type consistency:** `getBalance` returns `{ free_remaining, paid_credits }` everywhere (Tasks 2, 4, 7, 8); `consumeCredit`/`addCredits` signatures `(admin, userId[, amount])` consistent across Tasks 2, 4, 6; RPC names `get_or_create_credits` / `consume_credit` / `add_credits` match between Task 1 SQL and Task 2 calls; `client_reference_id` used consistently in Tasks 5 and 6. ✓
