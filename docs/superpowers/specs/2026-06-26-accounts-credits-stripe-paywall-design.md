# Accounts + Credits + Stripe Paywall — Design

**Date:** 2026-06-26
**Status:** Approved, ready for implementation plan

## Goal

Convert Cold Outreach Studio from a free tool (email gate → unlimited use) into one that
produces revenue. Every account gets **3 free generations**, then must buy a **$29 / 50-credit
pack** to continue. Credits are tracked server-side per user; a Stripe webhook tops them up.
No subscriptions.

The strategic intent (from the board call that preceded this): do the cheapest thing that
produces a dollar, then let the first ~10 payments tell us whether the price and niche are
right. This spec builds the durable version of that paywall (real accounts, not an honor
system) because robust enforcement was explicitly chosen over the fastest hack.

## Non-goals / out of scope

- **Subscriptions / recurring billing.** One-time consumable packs only.
- **The email blast to the existing `signups` list** and the marketing headline
  ("Founders doing their own prospecting"). These are operational actions, not code. The
  recommended paywall/landing copy is captured below as reference, but sending the campaign is
  a manual step.
- **Anonymous "try before sign-in".** Rejected — it re-introduces the `localStorage`-gameable
  trust problem we are deliberately avoiding.
- **Credit expiry.** Free allotment and purchased packs do not expire. Packs stack.

## Decisions locked during brainstorming

1. **Enforcement:** real **Supabase Auth (magic-link) accounts**, credits per `user_id`
   (chosen over a `localStorage` honor system or no-auth email ledger).
2. **Fulfillment:** **Stripe webhook auto-credit** (chosen over manual SQL fulfillment).
3. **Login-first:** you must be signed in to generate at all (consistent with today's
   gate-first UX; avoids anonymous credit tracking).
4. **Rate limiter stays:** the per-IP 5/hr Upstash middleware remains as a coarse anti-abuse
   guard; credits are the real usage limit.
5. **Credit behavior:** 3 free per account, no expiry; purchased 50-packs stack additively;
   free pool is consumed before paid credits.

## Architecture

### Auth flow (replaces the current email gate)

- The "Unlock Access to the Studio" card becomes **"Sign in to start"**: enter email →
  Supabase Auth emails a magic link → user clicks → returns authenticated.
- Uses `@supabase/ssr` (already a dependency):
  - a **browser client** to trigger `signInWithOtp` (magic link),
  - a **server client** that reads the auth cookie so API routes know the caller's identity.
- A **`/auth/callback`** route exchanges the magic-link code for a session
  (`exchangeCodeForSession`) and redirects back to the app.
- The old `localStorage "cos_subscribed"` mechanism and the `/api/subscribe` gate behavior are
  removed from the unlock path. (`signups` table is retained for the mailing list; whether to
  keep writing to it on sign-up is decided in the plan — default: insert the email on first
  sign-in so the list keeps growing.)

### Data model

New table `user_credits` — one row per auth user:

```
user_credits
  user_id      uuid        primary key, references auth.users(id) on delete cascade
  free_used    int         not null default 0     -- caps at 3
  paid_credits int         not null default 0     -- purchased packs accumulate here
  updated_at   timestamptz not null default now()
```

- **RLS:** a user may `select` their own row (`auth.uid() = user_id`). **No** user-level
  `insert`/`update`/`delete`; all writes happen via the service role from server code.
- The row is created lazily via upsert on the first generation attempt.

New table `stripe_events` — webhook idempotency:

```
stripe_events
  event_id    text        primary key
  created_at  timestamptz not null default now()
```

The existing `signups` table is **unchanged** and retained as the marketing list.

### Generation + paywall logic (`/api/research`)

1. Authenticate via the server Supabase client. No valid session → `401`.
2. Load (or upsert) the caller's `user_credits` row. Compute
   `free_remaining = max(0, 3 - free_used)`.
3. If `free_remaining > 0` **or** `paid_credits > 0` → run the existing AI pipeline
   (Anthropic → Gemini fallback, unchanged).
4. **Consume only on success:** after a valid email object is produced, decrement one credit —
   **free pool first**, then paid. A failed/timed-out generation costs nothing.
   - Decrement is an atomic conditional `update` (e.g. decrement `paid_credits` only
     `where paid_credits > 0`, or increment `free_used` only `where free_used < 3`).
5. If neither pool has room → return `402 { error, paywall: true }` **before** doing AI work.
   The client swaps the result area for the **paywall card**.

**Concurrency note (accepted tradeoff):** check-then-consume has a small race — rapid parallel
requests from one user could let one extra generation through. The per-IP 5/hr middleware
bounds this. We will *not* build distributed locking at this stage; documented here as a known
limitation.

### Stripe

- **`/api/checkout`** (authenticated): creates a Stripe Checkout Session —
  `mode: "payment"`, one line item (`STRIPE_PRICE_ID`, $29), `client_reference_id = user.id`,
  `customer_email` prefilled, `success_url` → app `?paid=1`, `cancel_url` → app. Returns the
  hosted Checkout `url`; the client redirects. No Stripe secrets reach the browser.
- **`/api/stripe-webhook`**: reads the **raw** request body, verifies the signature with
  `STRIPE_WEBHOOK_SECRET` (invalid → `400`). On `checkout.session.completed`:
  1. Insert `event.id` into `stripe_events`; if it already exists, skip (idempotent).
  2. `paid_credits += 50` for the `client_reference_id` user, via the service role.
  - Other event types are acknowledged with `200` and ignored.

### Balance display

- **`GET /api/credits`** (authenticated) returns `{ free_remaining, paid_credits }`.
- The app header shows the balance — e.g. **"2 free left"** or **"47 emails left"** — and
  re-fetches after returning from Checkout (`?paid=1`).

## New environment variables

| Var | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe server SDK (checkout + webhook) |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures |
| `STRIPE_PRICE_ID` | The $29 / 50-credit price object |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side Supabase Auth (today only the service role is used) |
| `NEXT_PUBLIC_SITE_URL` | Magic-link redirect + Stripe success/cancel URLs |

All added to `.env.example`. New dependency: `stripe` (server SDK).

## Error handling

- Unauthenticated API calls → `401`; client routes the user back to the sign-in card.
- Out of credits → `402 { paywall: true }`; client shows the paywall card.
- Stripe webhook signature failure → `400`, logged via `reportError`.
- AI pipeline failures behave exactly as today (Anthropic→Gemini fallback, friendly 500) and
  **do not** consume a credit.
- Supabase write failures during credit decrement are logged; the generated email is still
  returned to the user (we fail open on the decrement so a DB hiccup never eats a paid result).

## Testing

Vitest, matching `tests/` conventions; Supabase and Stripe mocked.

- Credit-state transitions: 3 free → paywall; free consumed before paid; paid decrements;
  consume-on-success-only (failed generation leaves balances untouched).
- `/api/research` returns `402 { paywall: true }` at zero credits and `401` when unauthenticated.
- Webhook: rejects bad signatures; adds 50 credits on `checkout.session.completed`; is
  idempotent on duplicate `event_id`; ignores unrelated event types.
- `/api/checkout`: builds a session with the correct `client_reference_id` and price.

## Reference: recommended paywall / landing copy (operational, not built here)

- Paywall card heading: **"You've used your 3 free emails."**
- Sub: **"$29 → 50 more signal-researched emails. One-time, no subscription."**
- Niche angle for the campaign + headline: **"Founders doing their own prospecting."**
- First action after ship: email the existing `signups` list with that offer and headline;
  let the first ~10 payments validate price + niche, then raise/niche down from there.
