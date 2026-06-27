# LinkedIn PDF Tutorial Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsed-by-default tutorial section above the "Your Details" form that embeds the LinkedIn PDF export tutorial HTML file in an expandable iframe.

**Architecture:** Copy the tutorial HTML file to the Next.js `public/` folder so it can be served as a static asset. Then add a single collapsible JSX block in `components/App.js` using a new `useState` toggle — no new files, no new dependencies.

**Tech Stack:** Next.js, React (useState), Lucide React icons (ChevronDown/ChevronUp)

## Global Constraints

- No new npm packages
- Match existing visual style: white background, `2px solid ${ink}` border, same `boxShadow` and `lbl` label style as other cards
- Label text: "How to export your LinkedIn profile as a PDF"
- Collapsed by default (`useState(false)`)
- iframe height: 480px

---

### Task 1: Copy tutorial HTML to public folder

**Files:**
- Create: `public/linkedin-pdf-tutorial.html` (copied from `~/Downloads/LinkedIn PDF Export Tutorial.html`)

- [ ] **Step 1: Copy the file**

```bash
cp "/Users/raybrown/Downloads/LinkedIn PDF Export Tutorial.html" /Users/raybrown/Desktop/outreach-studio/public/linkedin-pdf-tutorial.html
```

- [ ] **Step 2: Verify it exists**

```bash
ls /Users/raybrown/Desktop/outreach-studio/public/linkedin-pdf-tutorial.html
```

Expected output: the file path printed with no error.

- [ ] **Step 3: Commit**

```bash
git add public/linkedin-pdf-tutorial.html
git commit -m "feat: add LinkedIn PDF export tutorial as static asset"
```

---

### Task 2: Add collapsible tutorial toggle to App.js

**Files:**
- Modify: `components/App.js:3` (Lucide import line)
- Modify: `components/App.js:70` (useState block — add tutorialOpen state)
- Modify: `components/App.js:252` (insert JSX block above the "Your Details" card)

**Interfaces:**
- Produces: a `tutorialOpen` boolean state and a collapsible JSX block that renders `/linkedin-pdf-tutorial.html` in an iframe when open.

- [ ] **Step 1: Add ChevronDown and ChevronUp to the Lucide import**

Find line 3 in `components/App.js`:
```js
import { Upload, RotateCcw, Sparkles, FileText, Search, Mail, ExternalLink, Lock, Send } from "lucide-react";
```

Replace with:
```js
import { Upload, RotateCcw, Sparkles, FileText, Search, Mail, ExternalLink, Lock, Send, ChevronDown, ChevronUp } from "lucide-react";
```

- [ ] **Step 2: Add the tutorialOpen state**

Find the useState block near line 70 (look for `const [senderName, setSenderName] = useState("");`). Add a new line directly above it:

```js
const [tutorialOpen, setTutorialOpen] = useState(false);
```

- [ ] **Step 3: Insert the tutorial toggle JSX block**

Find line 252 in `components/App.js` — it reads:
```jsx
<div style={{ background: white, border: `2px solid ${ink}`, boxShadow: shadow(4), padding: "20px 20px 24px" }}>
```

Insert this block **directly above** that line:

```jsx
<div style={{ border: `2px solid ${ink}`, boxShadow: shadow(4), background: white, overflow: "hidden" }}>
  <div
    onClick={() => setTutorialOpen(o => !o)}
    style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", cursor: "pointer",
    }}
  >
    <span style={{ ...lbl, fontSize: 9, letterSpacing: "0.18em", margin: 0 }}>
      How to export your LinkedIn profile as a PDF
    </span>
    {tutorialOpen ? <ChevronUp size={16} color={ink} /> : <ChevronDown size={16} color={ink} />}
  </div>
  {tutorialOpen && (
    <iframe
      src="/linkedin-pdf-tutorial.html"
      style={{ display: "block", width: "100%", height: 480, border: "none" }}
      title="LinkedIn PDF export tutorial"
    />
  )}
</div>
```

- [ ] **Step 4: Verify the app runs without errors**

```bash
npm run dev
```

Open http://localhost:3000 in a browser. Log in or bypass the auth gate. Confirm:
- The toggle row appears above "Your Details"
- Clicking it expands to show the tutorial iframe
- Clicking again collapses it
- No console errors

- [ ] **Step 5: Commit**

```bash
git add components/App.js
git commit -m "feat: add collapsible LinkedIn PDF tutorial above Your Details form"
```
