"use client";
import { FileText, Search, Mail, Lock, ExternalLink, Sparkles } from "lucide-react";

const ink = "#1a1714";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

const STEPS = [
  { icon: FileText, title: "Upload a LinkedIn PDF", body: "Export the prospect's profile (More… → Save to PDF) and drop it in." },
  { icon: Search,   title: "We research the signal", body: "The app searches the web for a real, recent reason to reach out — funding, a launch, a feature." },
  { icon: Mail,     title: "Get the written email", body: "A complete six-part email, built on that signal. You verify, you send." },
];

const FRAMEWORK = ["The Hook", "The Signal", "The Intro", "The Link", "The Teaser", "The Ask"];

// Real generated sample (SushiDog · The Grocer, May 2026). Two cosmetic lines
// tidied: the intro no longer reads "I'm Cold Outreach Studio", and the link
// shows the brand name instead of a raw deploy URL.
const SAMPLE = {
  prospect: "Greg Ilsen · Co-Founder at SushiDog",
  signalHeadline: "SushiDog celebrates 8th anniversary with nationwide giveaway",
  signalDetail: "SushiDog celebrated its eighth anniversary by giving away over 2,000 free products across its 14 UK stores.",
  source: "The Grocer · May 2026",
  subject: "Quick thought on SushiDog's 8th anniversary engagement",
  greeting: "Hi Greg,",
  parts: [
    ["The Hook", "How are you approaching customer engagement and brand growth following SushiDog's recent anniversary celebrations?"],
    ["The Signal", "I noticed the fantastic nationwide giveaway SushiDog executed recently, distributing over 2,000 free products to mark your 8th anniversary.", true],
    ["The Intro", "We're Cold Outreach Studio — we help founders and sales teams write cold emails that actually get replies, by researching each prospect and building every email on a real, recent signal instead of mail-merge spam."],
    ["The Link", "We run Cold Outreach Studio."],
    ["The Teaser", "Given the success of your anniversary giveaway in driving engagement, I believe we could explore how to convert those new users into long-term loyal customers with highly personalised follow-up campaigns."],
    ["The Ask", "Would you be open to a brief 15-minute call to discuss this — perhaps Thursday afternoon or Friday morning?"],
  ],
};

export default function Landing({ onGoogle, authError, email, onEmailChange, onEmailSubmit, emailLoading, emailSent }) {
  return (
    <div className="landing">

      {/* HERO */}
      <section className="lp-hero">
        <span className="lp-eyebrow">Cold Outreach Studio</span>
        <h1 className="lp-h1">Every cold email, built on a real reason to reach out.</h1>
        <p className="lp-sub">
          We research the prospect, find a recent signal, and write the email — in about 30 seconds.
          You verify, you send.
        </p>
        <button type="button" className="btn-primary lp-cta" onClick={onGoogle}>
          <GoogleMark /> Start free — 3 emails on us
        </button>
        <span className="lp-cta-note">No card. 3 free emails, then $49 for 50. One-time.</span>
      </section>

      {/* HOW IT WORKS */}
      <section className="lp-section">
        <h2 className="lp-h2">How it works</h2>
        <div className="lp-steps">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="lp-step">
                <div className="lp-step__icon"><Icon size={18} color={ink} /></div>
                <span className="lp-step__num">{`0${i + 1}`}</span>
                <h3 className="lp-step__title">{s.title}</h3>
                <p className="lp-step__body">{s.body}</p>
              </div>
            );
          })}
        </div>
        <video className="lp-video" controls preload="none" poster="/demo-poster.jpg">
          <source src="/demo.mp4" type="video/mp4" />
        </video>
        <span className="lp-video__cap">42 seconds: find a prospect → export → upload → send in Gmail.</span>
      </section>

      {/* FRAMEWORK */}
      <section className="lp-section">
        <h2 className="lp-h2">A method, not a one-shot prompt</h2>
        <p className="lp-section__sub">Every email follows the same six-part framework, so it reads like you wrote it.</p>
        <div className="lp-chips">
          {FRAMEWORK.map((label, i) => (
            <span key={label} className="lp-chip"><span className="lp-chip__num">{`0${i + 1}`}</span>{label}</span>
          ))}
        </div>
      </section>

      {/* PROOF — real sample email */}
      <section className="lp-section">
        <h2 className="lp-h2">A real email, from a real signal</h2>
        <p className="lp-section__sub">Generated from a public LinkedIn profile — the signal is verifiable.</p>

        <div className="lp-proof">
          <div className="lp-proof__prospect">
            <Sparkles size={15} color="#d4af37" />
            <span>{SAMPLE.prospect}</span>
          </div>

          <div className="lp-proof__signal">
            <div className="lp-proof__signal-head">
              <span className="signal-tier signal-tier--hot">Hot signal</span>
              <span className="lp-proof__source">{SAMPLE.source}</span>
            </div>
            <p className="lp-proof__signal-headline">{SAMPLE.signalHeadline}</p>
            <p className="lp-proof__signal-detail">{SAMPLE.signalDetail}</p>
            <span className="lp-proof__verify"><ExternalLink size={12} /> Verify source · {SAMPLE.source.split(" · ")[0]}</span>
          </div>

          <div className="lp-proof__email">
            <span className="lp-proof__subject">{SAMPLE.subject}</span>
            <p className="lp-proof__greeting">{SAMPLE.greeting}</p>
            {SAMPLE.parts.map(([label, text, highlight]) => (
              <div key={label} className={`lp-proof__part${highlight ? " lp-proof__part--signal" : ""}`}>
                <span className="lp-proof__label">{label}</span>
                <p className="lp-proof__text">{text}</p>
              </div>
            ))}
            <p className="lp-proof__signoff">Best,<br /><strong>Cold Outreach Studio</strong></p>
          </div>
        </div>
      </section>

      {/* OFFER + SIGN-IN */}
      <section className="lp-section lp-offer" id="start">
        <div className="gate-lock"><Lock size={18} color={ink} /></div>
        <h2 className="lp-h2">Try 3 free</h2>
        <p className="lp-section__sub">Then $49 for 50 signal-researched emails. One-time — no subscription.</p>

        <div className="gate-form lp-gate">
          <button type="button" className="btn-primary" onClick={onGoogle}>
            <GoogleMark /> Continue with Google
          </button>
          {authError && <p className="gate-error">⚠ {authError}</p>}

          <div className="gate-divider"><span>or use email</span></div>

          <form onSubmit={onEmailSubmit} className="gate-emailform">
            <input
              type="email"
              className="form-input"
              placeholder="name@company.com"
              value={email}
              onChange={e => onEmailChange(e.target.value)}
              disabled={emailLoading}
              required
            />
            <button type="submit" className="btn-secondary" disabled={emailLoading}>
              {emailLoading ? "Sending link..." : "Email me a magic link"}
            </button>
          </form>
          {emailSent && <p className="lp-section__sub" style={{ marginTop: 4 }}>✓ Check your inbox for the sign-in link.</p>}
        </div>
      </section>

      <footer className="app-footer">Cold Outreach Studio · we save your generated emails, never the uploaded PDF</footer>
    </div>
  );
}
