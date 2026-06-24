# Gemini Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Gemini 2.5 Pro as an automatic fallback so the app keeps working when Anthropic credits run out, with no manual intervention needed.

**Architecture:** Refactor `/app/api/research/route.js` to extract two exported provider functions (`callAnthropic`, `callGemini`) with identical signatures. The `POST` handler tries Anthropic first (20s abort); on 402/429/5xx or timeout it logs to Slack and retries with Gemini (35s abort). The prompt is unchanged — it works on any capable model. `parseJsonResponse` is shared by both providers.

**Tech Stack:** Next.js 15 App Router, Vitest (node environment), native `fetch`, Anthropic Messages API, Google Gemini generateContent API

## Global Constraints

- `maxDuration` stays `60` — Vercel static export, cannot be a variable
- Anthropic abort timeout: `20000` ms
- Gemini abort timeout: `35000` ms
- Fallback triggers: HTTP 402, 429, 5xx from Anthropic, or `AbortError` (no `.status` on thrown error)
- No fallback on HTTP 400 (bad request — Gemini would fail identically)
- Gemini model: `gemini-2.5-pro`
- New env var: `GOOGLE_AI_API_KEY`
- All existing tests in `tests/lib/reportError.test.js` must keep passing

---

### Task 1: Extract `callAnthropic` and `parseJsonResponse`

**Files:**
- Modify: `app/api/research/route.js`
- Create: `tests/api/research.test.js`

**Interfaces:**
- Produces: `export function parseJsonResponse(raw: string): object` — strips markdown fences, parses JSON, throws if unparseable
- Produces: `export async function callAnthropic(pdfBase64: string, prompt: string): Promise<object>` — calls Anthropic API, returns parsed JSON, throws `Error` with `.status` set to HTTP status on non-OK response, throws `AbortError` on 20s timeout

- [ ] **Step 1: Create `tests/api/research.test.js` with a failing test**

```js
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { callAnthropic } from "../../app/api/research/route.js";

describe("callAnthropic", () => {
  let originalKey;

  beforeEach(() => {
    originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("returns parsed JSON when Anthropic responds successfully", async () => {
    const mockPayload = { prospect_name: "Jane Smith", subject: "Test" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(mockPayload) }],
      }),
    });

    const result = await callAnthropic("base64pdf==", "prompt text");
    expect(result).toEqual(mockPayload);
  });

  it("throws with .status when Anthropic returns a non-OK response", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      text: async () => "credits exhausted",
    });

    await expect(callAnthropic("base64pdf==", "prompt")).rejects.toMatchObject({
      status: 402,
    });
  });

  it("parses JSON wrapped in markdown fences", async () => {
    const mockPayload = { prospect_name: "Alex" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "```json\n" + JSON.stringify(mockPayload) + "\n```" }],
      }),
    });

    const result = await callAnthropic("base64pdf==", "prompt");
    expect(result.prospect_name).toBe("Alex");
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npm test -- tests/api/research.test.js
```

Expected: FAIL — `callAnthropic is not a function` or similar export error.

- [ ] **Step 3: Add `parseJsonResponse` and `callAnthropic` to `route.js`**

Add these two functions **before** the `POST` export. Do not change `POST` yet.

```js
function parseJsonResponse(raw) {
  const clean = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not parse AI response as JSON");
  }
}

export async function callAnthropic(pdfBase64, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  clearTimeout(timer);

  if (!resp.ok) {
    const err = await resp.text();
    const error = new Error(`Anthropic ${resp.status}: ${err.slice(0, 200)}`);
    error.status = resp.status;
    throw error;
  }

  const data = await resp.json();
  const textBlock = [...(data.content || [])].reverse().find(b => b.type === "text");
  if (!textBlock) throw new Error("Anthropic returned no text block");
  return parseJsonResponse(textBlock.text);
}
```

- [ ] **Step 4: Run to confirm all three tests pass**

```bash
npm test -- tests/api/research.test.js
```

Expected: 3 PASS.

- [ ] **Step 5: Confirm existing tests still pass**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/research/route.js tests/api/research.test.js
git commit -m "refactor: extract callAnthropic and parseJsonResponse from research route"
```

---

### Task 2: Add `callGemini`

**Files:**
- Modify: `app/api/research/route.js`
- Modify: `tests/api/research.test.js`

**Interfaces:**
- Consumes: `parseJsonResponse(raw: string): object` from Task 1
- Produces: `export async function callGemini(pdfBase64: string, prompt: string): Promise<object>` — calls Gemini API with inline PDF and Google Search grounding, returns parsed JSON (same shape as `callAnthropic`), throws `Error` with `.status` set on non-OK response, throws `AbortError` on 35s timeout

- [ ] **Step 1: Append failing tests to `tests/api/research.test.js`**

```js
import { callGemini } from "../../app/api/research/route.js";

describe("callGemini", () => {
  let originalKey;

  beforeEach(() => {
    originalKey = process.env.GOOGLE_AI_API_KEY;
    process.env.GOOGLE_AI_API_KEY = "test-gemini-key";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.GOOGLE_AI_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("returns parsed JSON when Gemini responds successfully", async () => {
    const mockPayload = { prospect_name: "Jane Smith", subject: "Test" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
      }),
    });

    const result = await callGemini("base64pdf==", "prompt text");
    expect(result).toEqual(mockPayload);
  });

  it("uses the GOOGLE_AI_API_KEY in the request URL", async () => {
    const mockPayload = { prospect_name: "Jane" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
      }),
    });

    await callGemini("base64pdf==", "prompt");
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain("key=test-gemini-key");
  });

  it("throws with .status on non-OK response", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "server error",
    });

    await expect(callGemini("base64pdf==", "prompt")).rejects.toMatchObject({
      status: 500,
    });
  });

  it("picks the last text part from candidates", async () => {
    const mockPayload = { prospect_name: "Final" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [
              { text: "intermediate text" },
              { text: JSON.stringify(mockPayload) },
            ],
          },
        }],
      }),
    });

    const result = await callGemini("base64pdf==", "prompt");
    expect(result.prospect_name).toBe("Final");
  });
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
npm test -- tests/api/research.test.js
```

Expected: callGemini tests FAIL, callAnthropic tests still PASS.

- [ ] **Step 3: Add `callGemini` to `route.js` after `callAnthropic`**

```js
export async function callGemini(pdfBase64, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;

  const resp = await fetch(url, {
    method: "POST",
    signal: controller.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
          { text: prompt },
        ],
      }],
      tools: [{ google_search: {} }],
    }),
  });
  clearTimeout(timer);

  if (!resp.ok) {
    const err = await resp.text();
    const error = new Error(`Gemini ${resp.status}: ${err.slice(0, 200)}`);
    error.status = resp.status;
    throw error;
  }

  const data = await resp.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const textBlock = [...parts].reverse().find(p => p.text);
  if (!textBlock) throw new Error("Gemini returned no text block");
  return parseJsonResponse(textBlock.text);
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/research/route.js tests/api/research.test.js
git commit -m "feat: add callGemini with 35s abort and Google Search grounding"
```

---

### Task 3: Wire fallback logic into `POST`

**Files:**
- Modify: `app/api/research/route.js`
- Modify: `tests/api/research.test.js`

**Interfaces:**
- Consumes: `callAnthropic(pdfBase64, prompt)` — throws with `.status` on provider failure
- Consumes: `callGemini(pdfBase64, prompt)` — throws with `.status` on provider failure
- Consumes: `reportError(route, error)` from `../../../lib/reportError.js`

- [ ] **Step 1: Append failing tests for the POST fallback behaviour**

```js
import { POST } from "../../app/api/research/route.js";

describe("POST handler — provider fallback", () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      SLACK_ERROR_WEBHOOK_URL: process.env.SLACK_ERROR_WEBHOOK_URL,
    };
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GOOGLE_AI_API_KEY = "test-gemini-key";
    process.env.SLACK_ERROR_WEBHOOK_URL = "";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
    vi.restoreAllMocks();
  });

  function makeRequest(overrides = {}) {
    return {
      json: async () => ({
        pdfBase64: "dGVzdA==",
        senderName: "Test Sender",
        companyUrl: "https://example.com",
        productDescription: "Test product",
        ...overrides,
      }),
    };
  }

  it("returns Anthropic result when Anthropic succeeds", async () => {
    const mockPayload = { prospect_name: "Jane", subject: "Hi Jane" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify(mockPayload) }] }),
    });

    const response = await POST(makeRequest());
    const body = await response.json();
    expect(body.prospect_name).toBe("Jane");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to Gemini when Anthropic returns 402", async () => {
    const mockPayload = { prospect_name: "Jane", subject: "Hi Jane" };
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 402, text: async () => "credits exhausted" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
        }),
      });

    const response = await POST(makeRequest());
    const body = await response.json();
    expect(body.prospect_name).toBe("Jane");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to Gemini when Anthropic returns 429", async () => {
    const mockPayload = { prospect_name: "Jane" };
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
        }),
      });

    const response = await POST(makeRequest());
    expect((await response.json()).prospect_name).toBe("Jane");
  });

  it("does NOT fall back when Anthropic returns 400", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad request" });

    const response = await POST(makeRequest());
    expect(response.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when both providers fail", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "gemini error" });

    const response = await POST(makeRequest());
    expect(response.status).toBe(500);
  });

  it("skips Anthropic and goes straight to Gemini when ANTHROPIC_API_KEY is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const mockPayload = { prospect_name: "Jane" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
      }),
    });

    const response = await POST(makeRequest());
    expect((await response.json()).prospect_name).toBe("Jane");
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
  });

  it("returns 500 immediately when both keys are absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;

    const response = await POST(makeRequest());
    expect(response.status).toBe(500);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
npm test -- tests/api/research.test.js
```

Expected: POST handler tests FAIL, provider unit tests still PASS.

- [ ] **Step 3: Replace the `POST` handler in `route.js`**

The prompt construction block (the large template literal starting "You are an elite B2B sales researcher...") does not change. Replace everything else in `POST` as shown below. The prompt string itself spans roughly lines 33–109 in the current file — copy it verbatim into the `prompt` assignment in the new handler.

```js
export async function POST(req) {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini    = !!process.env.GOOGLE_AI_API_KEY;

  if (!hasAnthropic && !hasGemini) {
    return Response.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  try {
    const { pdfBase64, senderName, companyUrl, productDescription } = await req.json();

    // ── sender / company / date setup ────────────────────────────────────────
    // Keep this block EXACTLY as it appears in the current file:
    //   const sender = ...
    //   const url    = ...
    //   let company; try { ... } catch { ... }
    //   const product = ...
    //   const MONTHS = [...]
    //   const now = new Date(); ...currentMonth/Year, prev1/2/3 Month/Year
    // ─────────────────────────────────────────────────────────────────────────

    // ── prompt ───────────────────────────────────────────────────────────────
    // Keep the entire `const prompt = \`...\`` template literal exactly as-is.
    // ─────────────────────────────────────────────────────────────────────────

    let parsed;

    if (hasAnthropic) {
      try {
        parsed = await callAnthropic(pdfBase64, prompt);
      } catch (anthropicErr) {
        const s = anthropicErr.status;
        const shouldFallback = !s || s === 402 || s === 429 || s >= 500;
        if (!shouldFallback || !hasGemini) {
          await reportError("research", anthropicErr);
          return Response.json({ error: anthropicErr.message || "Server error" }, { status: 500 });
        }
        reportError("research", new Error(`Anthropic failed (${s ?? "timeout"}), falling back to Gemini: ${anthropicErr.message}`)).catch(() => {});
      }
    }

    if (!parsed) {
      parsed = await callGemini(pdfBase64, prompt);
    }

    return Response.json(parsed);

  } catch (e) {
    await reportError("research", e);
    const msg = e.name === "AbortError"
      ? "Research timed out — please try again."
      : e.message || "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
```

> **Note on the comments:** The `// Keep this block EXACTLY...` comments are instructions for this step only — remove them once you've pasted the real code in their place. The final file should contain no TODO-style comments.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS, including pre-existing `reportError` tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/research/route.js tests/api/research.test.js
git commit -m "feat: Gemini 2.5 Pro fallback — retries on Anthropic 402/429/5xx/timeout"
```

---

### Task 4: Update docs and deploy

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Update `.env.example`**

Replace the Anthropic comment line and add the Gemini entry so the block reads:

```
# Anthropic — primary AI provider for email generation and web research
ANTHROPIC_API_KEY=

# Google Gemini — fallback AI provider (activates automatically if Anthropic is unavailable)
GOOGLE_AI_API_KEY=
```

- [ ] **Step 2: Update the env var table in `README.md`**

Change the `ANTHROPIC_API_KEY` row's Required column to `Yes (primary)`.

Add a new row immediately after it:

```markdown
| `GOOGLE_AI_API_KEY` | Yes (fallback) | Google AI Studio API key. Powers Gemini 2.5 Pro when Anthropic is unavailable. Get one free at [aistudio.google.com](https://aistudio.google.com). |
```

- [ ] **Step 3: Commit and push**

```bash
git add README.md .env.example
git commit -m "docs: add GOOGLE_AI_API_KEY to env docs for Gemini fallback"
git push origin main
```

- [ ] **Step 4: Add `GOOGLE_AI_API_KEY` to Vercel**

1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Add: Key = `GOOGLE_AI_API_KEY`, Value = your Google AI Studio API key, Environment = Production
4. Save — Vercel will trigger a redeploy automatically

- [ ] **Step 5: Smoke test on the live site**

Open https://outreach-studio-eight.vercel.app, upload a LinkedIn PDF, and confirm the email generates end-to-end. If Anthropic credits are still exhausted, Gemini will handle it — you should see a result either way.
