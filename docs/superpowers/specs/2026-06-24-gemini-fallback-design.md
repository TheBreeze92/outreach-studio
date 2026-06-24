# Gemini Fallback Design

**Date:** 2026-06-24  
**Status:** Approved

## Problem

The app's email generation relies entirely on Anthropic (Claude). When Anthropic credits run out or the service is unreachable, the app stops working completely. We need a fallback provider that kicks in automatically, with no manual intervention required.

## Solution

Add Google Gemini 2.5 Pro as a fallback inside `/app/api/research/route.js`. Anthropic remains the primary provider. If Anthropic fails for a provider reason (credits, rate limit, server error, or timeout), the route retries the same request using Gemini. When Anthropic credits are topped up, it automatically takes over again — no code change required.

## Architecture

The route is refactored into two private async functions with identical signatures:

```
callAnthropic(pdfBase64, prompt) → parsed JSON
callGemini(pdfBase64, prompt) → parsed JSON
```

The route calls `callAnthropic` first. On qualifying failures, it calls `callGemini`. Both functions return the same JSON shape. The prompt is unchanged — it's model-agnostic plain English.

## Fallback Trigger Conditions

Fall through to Gemini when Anthropic returns:
- `402` — out of credits
- `429` — rate limited
- `5xx` — server error
- `AbortError` — Anthropic abort fires (20s timeout exceeded)

Do NOT fall through to Gemini when Anthropic returns:
- `400` — bad request (e.g. malformed PDF). Gemini would fail for the same reason.

## Timeout Budget

| Stage | Timeout | Reason |
|---|---|---|
| Anthropic abort | 20s | Enough for a normal call; fails fast so Gemini has budget |
| Gemini abort | 35s | Remainder of Vercel ceiling |
| Vercel `maxDuration` | 60s | Unchanged |

Worst case: Anthropic hangs to 20s + Gemini takes 35s = 55s. Within the 60s ceiling.  
Common case (credits exhausted): Anthropic returns 402 in <1s + Gemini takes ~20s = ~21s total.

## Gemini Integration

- **Model:** `gemini-2.5-pro`
- **API endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent`
- **PDF:** Passed as `inline_data` with `mime_type: "application/pdf"` and base64 data — same approach as Anthropic, no file upload step
- **Web search:** `{ "google_search": {} }` tool — Google's built-in search grounding
- **Response parsing:** Extract the last `text` part from `candidates[0].content.parts`, then run through the same JSON cleanup and `JSON.parse` logic already in the route

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (primary) | Existing. If absent, skip straight to Gemini. |
| `GOOGLE_AI_API_KEY` | Yes (fallback) | New. Must be added to Vercel project settings. |

If `ANTHROPIC_API_KEY` is absent but `GOOGLE_AI_API_KEY` is present, the route skips straight to Gemini. If both are absent, return a 500 immediately.

## Error Reporting

- Anthropic failure that triggers a fallback: log to Slack via `reportError` (non-blocking), then continue to Gemini
- Both providers fail: log to Slack, return 500 to the user
- Anthropic success: Gemini is never called, no change to current behaviour

## Files Changed

- `app/api/research/route.js` — only file modified

## Out of Scope

- No changes to the prompt
- No changes to the UI
- No changes to rate limiting, error boundary, or subscribe route
- Sentry integration (separate spec)
- Tutorial video (separate task)
