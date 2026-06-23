# Send Email Feature Design — Cold Outreach Studio
**Date:** 2026-06-23
**Status:** Approved for implementation

## What this builds

A "Send email" button that opens the user's default mail app (Mail, Outlook, Gmail desktop) with the generated cold email pre-loaded — subject filled in, body formatted and ready, prospect's email in the To field if the user provided one. The user reviews, edits if needed, and sends from their own inbox.

No backend API. No email service account. No new packages. Pure browser behaviour.

---

## Why mailto: not an email API

The original brief proposed Resend/SendGrid. This approach was rejected in favour of `mailto:` for the following reasons:

- **Authenticity** — the email comes from the sender's real inbox, not a third-party service. Cold outreach sent from `send@some-saas-tool.com` is immediately less credible.
- **Zero setup** — no API key, no domain verification, no account. Works on day one.
- **User control** — the user sees the email in their own mail app before it goes. They can edit, attach, or cancel. This is the right behaviour for a tool where quality and personalisation matter.
- **No liability** — the app never touches the email content after it leaves the browser.

---

## UI Changes

### Removed
- The **"Copy email"** button from the email card header — gone entirely.
- The `copied` boolean state and `copyEmail` function from `components/App.js`.
- The hidden `<textarea ref={hiddenTA}>` used as a clipboard fallback.

### Added
A **send panel** below the email card, above the "Research a new prospect" reset button. It contains:

1. **Prospect email input** — labelled *"Prospect's email (optional)"*, plain text input, empty by default. If the user fills it in, it pre-populates the `To:` field. If left blank, `To:` is omitted and the user fills it in their mail app.

2. **"Send email" button** — full-width, styled to match the existing dark chocolate CTA buttons (same background, border, shadow, uppercase weight as "Research prospect & write email"). Clicking it fires the mailto link.

### Email card header
Becomes label-only — "Your cold email" — with no action button. Clean.

### State changes in App.js
- **Add:** `prospectEmail` — string, empty string default, reset to `""` on `reset()`
- **Remove:** `copied` — boolean state, no longer needed
- **Remove:** `copyEmail` — function, no longer needed

---

## How the mailto link is constructed

```
mailto:[prospectEmail]?subject=[encoded subject]&body=[encoded body]
```

**To:** `prospectEmail` if non-empty, omitted entirely if blank (not `mailto:?subject=...` with an empty `to=`).

**Subject:** `result.subject`, URL-encoded.

**Body:**
```
[greeting]

[hook]

[signal_line]

[intro]

[link_line]

[teaser]

[cta]

Best,
[senderName]
```

Markdown links are stripped before encoding: `[text](url)` → `text (url)`. This ensures the email body reads as clean plain text in any mail client rather than raw markdown syntax.

**Trigger:** `window.location.href = mailtoUrl` — opens the system default mail app.

---

## Error handling and edge cases

| Scenario | Behaviour |
|---|---|
| No default mail app configured | Browser handles silently — nothing bad happens to the app |
| Prospect email field left blank | `to:` omitted from mailto, user fills it in their mail app |
| Email body exceeds mailto character limit (~2000 chars) | Unlikely given the 6-part framework's concise output — no special handling |
| User wants to edit before sending | They edit in their mail app — this is the intended flow |

---

## Testing

No automated tests. The change removes code (copy function, clipboard state) and adds a browser API call (`window.location.href`). Manual verification:

1. Generate an email
2. Enter a prospect email in the optional field
3. Click "Send email" — mail app opens with correct To, Subject, and Body
4. Repeat with prospect field empty — mail app opens with blank To field
5. Confirm "Research a new prospect" resets the prospect email field to empty

---

## Files changed

- **Modified:** `components/App.js` — only file touched. No new files, no new routes, no new packages.

## What is explicitly out of scope

- Resend / SendGrid / any email API — not needed
- Backend route `/api/send-email` — not needed
- Copy-to-clipboard fallback — removed, not replaced
- Detection of whether a mail client is configured — not worth the complexity
