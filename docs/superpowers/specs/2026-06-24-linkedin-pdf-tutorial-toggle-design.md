# LinkedIn PDF Tutorial Toggle — Design Spec
Date: 2026-06-24

## Goal
Add a collapsible tutorial section above the "Your Details" input form in `components/App.js`. It teaches new users how to export a LinkedIn profile as a PDF before they try to upload one.

## Position
Sits directly above the "Your Details" card (currently App.js:253), inside the main interface column (`!result && !loading` branch).

## Behaviour
- Collapsed by default. A single `useState(false)` toggle controls open/closed.
- Clicking the row toggles between collapsed and expanded.
- State resets on page reload (no persistence needed).

## Visual — Collapsed State
- Full-width clickable row styled to match existing app cards: white background, `2px solid ${ink}` border, matching `boxShadow`.
- Left: label text **"How to export your LinkedIn profile as a PDF"** in the same small uppercase style (`lbl`) used by the "Your details" label.
- Right: Lucide `ChevronDown` icon (closed) / `ChevronUp` icon (open) — both already imported in App.js.
- Cursor: pointer.

## Visual — Expanded State
- The label row stays visible at the top.
- Below it, an `<iframe>` renders the tutorial at full width, fixed height of 480px, no border.
- The iframe `src` points to `/linkedin-pdf-tutorial.html` (served from the `public/` folder).

## Assets
- Copy `LinkedIn PDF Export Tutorial.html` from the user's Downloads into `public/linkedin-pdf-tutorial.html`.

## Implementation Scope
- Edit `components/App.js` only: add one `useState` and one JSX block (~20 lines).
- Add `ChevronDown` and `ChevronUp` to the existing Lucide import line.
- Copy the HTML file into `public/`.
- No new components, no new dependencies.
