# Send Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Copy email" button with a "Send email" button that opens the user's default mail app with the generated email pre-filled.

**Architecture:** A pure `buildMailtoUrl` utility function handles URL construction and markdown stripping. App.js imports it, adds a `prospectEmail` state, and renders an optional email input + send button below the email card. No backend, no new packages.

**Tech Stack:** Next.js 15 App Router, React 19, lucide-react (existing), Vitest (existing)

## Global Constraints

- Only `components/App.js` and `lib/buildMailtoUrl.js` are touched — no new routes, no new packages
- Button label is exactly "Send email" (sentence case, not "Send Email")
- Prospect email field is optional — if blank, `mailto:` URL has no `to` value
- Markdown links stripped as `text (url)` not `text: url` or `text - url`
- `mailto:` uses `encodeURIComponent` directly — NOT `URLSearchParams` (which encodes spaces as `+`, breaking mail clients)
- Sign-off format: `Best,\n[senderName]` — falls back to `"Alex Johnson"` if senderName is empty
- Send button styled identically to the existing "Research prospect & write email" button: `background: choc`, `color: cream`, `border: 2px solid ink`, `boxShadow: shadow(4, amber)`

---

### Task 1: Remove copy functionality from App.js

**Files:**
- Modify: `components/App.js`

**Interfaces:**
- Produces: App.js with `copied` state, `copyEmail` function, `hiddenTA` ref, Copy button, and hidden textarea all removed. `Copy` and `Check` removed from lucide imports.

- [ ] **Step 1: Remove Copy and Check from the lucide import**

Find line 3 in `components/App.js`:
```javascript
import { Upload, Copy, Check, RotateCcw, Sparkles, FileText, Search, Mail, ExternalLink, Lock } from "lucide-react";
```

Replace with:
```javascript
import { Upload, RotateCcw, Sparkles, FileText, Search, Mail, ExternalLink, Lock, Send } from "lucide-react";
```

(Adding `Send` now — used in Task 3.)

- [ ] **Step 2: Remove the `copied` state**

Find line 79:
```javascript
  const [copied,   setCopied]   = useState(false);
```

Delete this line entirely.

- [ ] **Step 3: Remove the `hiddenTA` ref**

Find line 83:
```javascript
  const hiddenTA  = useRef();
```

Delete this line entirely.

- [ ] **Step 4: Remove the `copyEmail` function**

Find and delete lines 172–188:
```javascript
  function copyEmail() {
    if (!result) return;
    const body = EMAIL_PARTS
      .map(([k]) => result[k] || "")
      .join("\n\n")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
    const full = `Subject: ${result.subject}\n\n${result.greeting}\n\n${body}\n\nBest,\n${senderName || "Alex Johnson"}`;
    navigator.clipboard.writeText(full).catch(() => {
      if (hiddenTA.current) {
        hiddenTA.current.value = full;
        hiddenTA.current.select();
        document.execCommand("copy");
      }
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
```

Delete all of it.

- [ ] **Step 5: Replace the email card header (remove Copy button)**

Find the email card header block (starting around line 411 after prior deletions):
```javascript
            <div className="rise" style={{ background: white, border: `2px solid ${ink}`, boxShadow: shadow(6), animationDelay: ".1s" }}>
              <div style={{ padding: "16px 20px", borderBottom: `2px solid ${ink}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: mute, display: "block" }}>Output · six-part framework</span>
                  <span style={{ fontFamily: "'Fraunces',serif", fontSize: "1.15rem", fontWeight: 600 }}>Your cold email</span>
                </div>
                <button type="button" onClick={copyEmail}
                  style={{ background: copied ? choc : amber, color: copied ? cream : ink, border: `2px solid ${ink}`, boxShadow: shadow(2), padding: "9px 16px", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background .2s, color .2s" }}>
                  {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy email</>}
                </button>
              </div>
```

Replace with:
```javascript
            <div className="rise" style={{ background: white, border: `2px solid ${ink}`, boxShadow: shadow(6), animationDelay: ".1s" }}>
              <div style={{ padding: "16px 20px", borderBottom: `2px solid ${ink}` }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: mute, display: "block" }}>Output · six-part framework</span>
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: "1.15rem", fontWeight: 600 }}>Your cold email</span>
              </div>
```

- [ ] **Step 6: Remove the hidden textarea**

Find near the bottom of the JSX:
```javascript
        <textarea ref={hiddenTA} readOnly aria-hidden="true" style={{ position: "fixed", left: -9999, opacity: 0, height: 0, width: 0 }} />
```

Delete this line entirely.

- [ ] **Step 7: Manual verification**

Run `npm run dev` and open the app. Generate an email. Confirm:
- The email card header shows "Your cold email" with no button
- No JavaScript errors in the browser console

- [ ] **Step 8: Commit**

```bash
git add components/App.js
git commit -m "refactor: remove copy email button and clipboard logic"
```

---

### Task 2: Create buildMailtoUrl utility with tests

**Files:**
- Create: `lib/buildMailtoUrl.js`
- Create: `tests/lib/buildMailtoUrl.test.js`

**Interfaces:**
- Produces: `buildMailtoUrl({ prospectEmail, subject, parts, greeting, senderName }): string`
  - `prospectEmail`: string — prospect's email address, may be empty
  - `subject`: string — email subject line
  - `parts`: string[] — array of 6 email body parts in order, may contain markdown links
  - `greeting`: string — e.g. `"Hi Jane,"`
  - `senderName`: string — sender's name for sign-off
  - Returns: a `mailto:` URL string

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/buildMailtoUrl.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { buildMailtoUrl } from "../../lib/buildMailtoUrl.js";

const base = {
  prospectEmail: "jane@acme.com",
  subject: "Quick question about Q2",
  parts: [
    "How are you thinking about growth?",
    "I noticed your team just launched a product.",
    "I'm Alex Johnson, founder of Texture Talks.",
    "We run [Texture Talks](https://texturetalks.co.uk).",
    "I'd love to explore a collaboration.",
    "Would Thursday at 2pm work for a 15-min call?",
  ],
  greeting: "Hi Jane,",
  senderName: "Alex Johnson",
};

describe("buildMailtoUrl", () => {
  it("starts with mailto: and the prospect email", () => {
    const url = buildMailtoUrl(base);
    expect(url).toMatch(/^mailto:jane@acme\.com\?/);
  });

  it("encodes the subject correctly", () => {
    const url = buildMailtoUrl(base);
    expect(url).toContain("subject=Quick%20question%20about%20Q2");
  });

  it("strips markdown links to plain text in the body", () => {
    const url = buildMailtoUrl(base);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("Texture Talks (https://texturetalks.co.uk)");
    expect(decoded).not.toContain("[Texture Talks]");
  });

  it("includes the greeting in the body", () => {
    const decoded = decodeURIComponent(buildMailtoUrl(base));
    expect(decoded).toContain("Hi Jane,");
  });

  it("includes the sign-off with sender name", () => {
    const decoded = decodeURIComponent(buildMailtoUrl(base));
    expect(decoded).toContain("Best,\nAlex Johnson");
  });

  it("omits to: when prospectEmail is empty", () => {
    const url = buildMailtoUrl({ ...base, prospectEmail: "" });
    expect(url).toMatch(/^mailto:\?/);
  });

  it("omits to: when prospectEmail is whitespace only", () => {
    const url = buildMailtoUrl({ ...base, prospectEmail: "   " });
    expect(url).toMatch(/^mailto:\?/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: 7 tests fail with `Cannot find module '../../lib/buildMailtoUrl.js'`

- [ ] **Step 3: Create lib/buildMailtoUrl.js**

Create `lib/buildMailtoUrl.js`:
```javascript
export function buildMailtoUrl({ prospectEmail, subject, parts, greeting, senderName }) {
  const strippedParts = parts.map(p =>
    p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
  );

  const body = [greeting, ...strippedParts, `Best,\n${senderName}`].join("\n\n");

  const to = prospectEmail.trim();
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected output:
```
✓ tests/lib/buildMailtoUrl.test.js (7)
  ✓ starts with mailto: and the prospect email
  ✓ encodes the subject correctly
  ✓ strips markdown links to plain text in the body
  ✓ includes the greeting in the body
  ✓ includes the sign-off with sender name
  ✓ omits to: when prospectEmail is empty
  ✓ omits to: when prospectEmail is whitespace only

Test Files  2 passed (2)
Tests       11 passed (11)
```

- [ ] **Step 5: Commit**

```bash
git add lib/buildMailtoUrl.js tests/lib/buildMailtoUrl.test.js
git commit -m "feat: add buildMailtoUrl utility with tests"
```

---

### Task 3: Add prospect email state and send panel to App.js

**Files:**
- Modify: `components/App.js`

**Interfaces:**
- Consumes: `buildMailtoUrl({ prospectEmail, subject, parts, greeting, senderName }): string` from `../lib/buildMailtoUrl.js`
- Consumes: `Send` icon from `lucide-react` (already added in Task 1 Step 1)
- Produces: Working "Send email" button that opens the system mail client

- [ ] **Step 1: Add buildMailtoUrl import to App.js**

Add as the second line of `components/App.js` (after `"use client";`):
```javascript
import { buildMailtoUrl } from "../lib/buildMailtoUrl.js";
```

- [ ] **Step 2: Add prospectEmail state**

Find the block of useState declarations (around line 74). After:
```javascript
  const [dragging, setDragging] = useState(false);
```

Add:
```javascript
  const [prospectEmail, setProspectEmail] = useState("");
```

- [ ] **Step 3: Update reset() to clear prospectEmail**

Find the `reset` function:
```javascript
  function reset() {
    setFile(null); setResult(null); setError(""); setCopied(false); setStepIdx(0);
  }
```

Replace with:
```javascript
  function reset() {
    setFile(null); setResult(null); setError(""); setStepIdx(0); setProspectEmail("");
  }
```

- [ ] **Step 4: Add the send panel below the email card**

Find the reset button at the bottom of the result section:
```javascript
            <button type="button" onClick={reset}
              style={{ background: "transparent", border: `2px dashed #c8c2b6`, color: mute, padding: "13px", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <RotateCcw size={13} /> Research a new prospect
            </button>
```

Insert the following BEFORE that reset button:
```javascript
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={lbl}>Prospect's email (optional)</label>
                <input
                  type="email"
                  style={{ ...inp, background: cream }}
                  placeholder="prospect@company.com"
                  value={prospectEmail}
                  onChange={e => setProspectEmail(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const url = buildMailtoUrl({
                    prospectEmail,
                    subject: result.subject,
                    parts: EMAIL_PARTS.map(([k]) => result[k] || ""),
                    greeting: result.greeting,
                    senderName: senderName || "Alex Johnson",
                  });
                  window.location.href = url;
                }}
                style={{
                  background: choc, color: cream, border: `2px solid ${ink}`,
                  boxShadow: shadow(4, amber), padding: "16px 24px",
                  fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                }}
              >
                <Send size={16} /> Send email
              </button>
            </div>
```

- [ ] **Step 5: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: 11 tests pass (4 from reportError + 7 from buildMailtoUrl).

- [ ] **Step 6: Manual verification**

Run `npm run dev` and open the app. Generate an email. Confirm:

1. Below the email card, an optional "Prospect's email" input field appears
2. Below that, a dark "Send email" button appears
3. Type a test email in the field (e.g. `test@example.com`) and click "Send email" — your mail app opens with To, Subject, and Body pre-filled. Subject matches the generated subject. Body has no markdown syntax (links appear as `Text (url)`).
4. Clear the email field and click "Send email" — mail app opens with blank To field.
5. Click "Research a new prospect" — the email field clears to empty.

- [ ] **Step 7: Commit**

```bash
git add components/App.js
git commit -m "feat: add send email button with optional prospect email field"
```

---

## Self-Review

**Spec coverage:**
- ✅ Copy button removed → Task 1
- ✅ `copied` state, `copyEmail` fn, `hiddenTA` ref, hidden textarea removed → Task 1
- ✅ `buildMailtoUrl` pure function with markdown stripping → Task 2
- ✅ `prospectEmail` state, optional input field → Task 3
- ✅ "Send email" button (exact label) → Task 3 Step 4
- ✅ `mailto:` omits `to:` when field is blank or whitespace → Task 2 test + implementation
- ✅ `reset()` clears `prospectEmail` → Task 3 Step 3
- ✅ Sign-off uses `senderName` with fallback to `"Alex Johnson"` → Task 2 implementation
- ✅ Send button styled to match existing CTA buttons → Task 3 Step 4
- ✅ `encodeURIComponent` not `URLSearchParams` → Task 2 Step 3

**Placeholder scan:** No TBDs, no "similar to" references, all code blocks complete.

**Type consistency:** `buildMailtoUrl` signature defined in Task 2 Step 3 (`{ prospectEmail, subject, parts, greeting, senderName }`), called identically in Task 3 Step 4. `EMAIL_PARTS.map(([k]) => result[k] || "")` matches the existing pattern already used in the removed `copyEmail` function.
