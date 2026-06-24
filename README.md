# Cold Outreach Studio

Turn a LinkedIn PDF into a high-signal, personalized cold email in seconds.

Cold Outreach Studio reads a prospect's LinkedIn profile, researches a recent buying signal (funding, new hire, product launch, press), and writes a cold email around that signal using a 6-part proprietary framework. The output is specific enough that the prospect believes it was written for them — because it was.

## How it works

1. User uploads a LinkedIn profile PDF
2. The app extracts the prospect's name, title, and company
3. It runs a live web search for a recent signal from the last 2–3 months
4. It writes a personalized cold email using the signal as the hook
5. User reviews and sends directly via Gmail

## Tech stack

- **Framework:** Next.js 15 (App Router)
- **AI:** Anthropic Claude (claude-claude-sonnet-4-6) with tool use for web search
- **Database:** Supabase (email signups)
- **Rate limiting:** Upstash Redis (5 generations/hour per IP)
- **Error monitoring:** Slack webhooks (server errors, middleware alerts, React crashes)
- **Deployment:** Vercel

## Local setup

### Prerequisites

- Node.js 18+
- A Vercel or local Next.js environment
- Accounts for: Anthropic, Supabase, Upstash, Slack (optional)

### 1. Clone and install

```bash
git clone https://github.com/TheBreeze92/cold-outreach-studio.git
cd cold-outreach-studio
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

See [Environment variables](#environment-variables) below for details on each one.

### 3. Set up Supabase

Create a table called `signups` in your Supabase project:

```sql
create table signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null
);
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key. Powers email generation and web research. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key. Used server-side to write signups. |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL. Enables rate limiting (5 req/hour/IP). Without this, rate limiting is skipped. |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST token. Required if `UPSTASH_REDIS_REST_URL` is set. |
| `SLACK_ERROR_WEBHOOK_URL` | No | Incoming webhook URL. Receives error alerts when API routes or the UI crash. |
| `SLACK_SIGNUP_WEBHOOK_URL` | No | Incoming webhook URL. Fires when a new email signup is recorded. |

## Project structure

```
app/
  api/
    research/        # POST — generates the cold email (rate-limited)
    subscribe/       # POST — saves email signups to Supabase
    report-client-error/  # POST — receives errors from the browser
  layout.js
  page.js            # Main UI
components/
  App.js             # Core app shell
  ErrorBoundary.js   # Catches React crashes and reports them
  buildMailtoUrl.js  # Builds Gmail compose deep-links
lib/
  reportError.js     # Sends structured error alerts to Slack
middleware.js        # Rate limiting via Upstash
```

## Running tests

```bash
npm test
```

Tests cover the `reportError` utility and the `buildMailtoUrl` helper.

## Deployment

The app is designed to deploy on Vercel. Set all environment variables in your Vercel project settings. The `maxDuration` on the `/api/research` route is set to 60 seconds to accommodate the AI + web search pipeline.
