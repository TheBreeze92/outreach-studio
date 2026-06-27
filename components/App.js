"use client";
import { useState, useRef, useEffect } from "react";
import { Upload, RotateCcw, Sparkles, FileText, Search, Mail, ExternalLink, Lock, Send, ChevronDown } from "lucide-react";
import { buildGmailUrl } from "../lib/buildMailtoUrl.js";
import { getBrowserClient } from "../lib/supabaseBrowser.js";

/* Color constants kept only for Lucide icon props */
const ink   = "#1a1714";
const choc  = "#2a1d17";
const amber = "#d4af37";
const mute  = "#8c857a";

function domainFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

function RichText({ text }) {
  if (!text) return null;
  return text.split(/(\[[^\]]+\]\([^)]+\))/g).map((p, i) => {
    const m = p.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (m) return (
      <a key={i} href={m[2]} target="_blank" rel="noreferrer"
        style={{ color: "#966b43", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {m[1]}
      </a>
    );
    return <span key={i}>{p}</span>;
  });
}

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

const SIGNAL_TIERS = {
  hot:     { label: "Hot signal", className: "signal-tier--hot" },
  soft:    { label: "Angle",      className: "signal-tier--soft" },
  general: { label: "Relevance",  className: "signal-tier--general" },
};

const EMAIL_PARTS = [
  ["hook",        "01 · The Hook"],
  ["signal_line", "02 · The Signal — Why Now"],
  ["intro",       "03 · The Intro"],
  ["link_line",   "04 · The Link"],
  ["teaser",      "05 · The Teaser"],
  ["cta",         "06 · The Ask"],
];

const STEPS = [
  { icon: FileText, label: "Reading the LinkedIn profile…" },
  { icon: Search,   label: "Researching the prospect & company…" },
  { icon: Search,   label: "Hunting for recent signals…" },
  { icon: Mail,     label: "Writing your tailored cold email…" },
];

export default function App() {
  const supabaseRef = useRef(null);
  const sb = () => {
    if (!supabaseRef.current) supabaseRef.current = getBrowserClient();
    return supabaseRef.current;
  };
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [balance, setBalance] = useState(null);   // { free_remaining, paid_credits } | null
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [recent, setRecent] = useState([]);

  async function refreshBalance() {
    try {
      const resp = await fetch("/api/credits");
      if (resp.ok) setBalance(await resp.json());
    } catch { /* non-fatal */ }
  }

  async function loadRecent() {
    try {
      const { data } = await sb()
        .from("generations")
        .select("id, created_at, signal_tier, signal_headline, replied, output")
        .order("created_at", { ascending: false })
        .limit(10);
      setRecent(data || []);
    } catch { /* non-fatal */ }
  }

  async function markReply(id, didReply) {
    setRecent(rows => rows.map(r => (r.id === id ? { ...r, replied: didReply } : r)));
    try {
      await fetch("/api/generations/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generation_id: id, replied: didReply }),
      });
    } catch { /* best-effort */ }
  }

  useEffect(() => {
    sb().auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) { refreshBalance(); loadRecent(); }
    });
    const { data: sub } = sb().auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) { refreshBalance(); loadRecent(); }
    });
    // After returning from Stripe Checkout, refresh and clean the URL.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paid") === "1") {
      refreshBalance();
      window.history.replaceState({}, "", "/");
    }
    return () => sub.subscription.unsubscribe();
  }, []);

  const [subscriberEmail,   setSubscriberEmail]   = useState("");
  const [subLoading,        setSubLoading]        = useState(false);
  const [subError,          setSubError]          = useState("");
  const [tutorialOpen,      setTutorialOpen]      = useState(false);
  const [senderName,        setSenderName]        = useState("");
  const [companyUrl,        setCompanyUrl]        = useState("");
  const [productDescription,setProductDescription]= useState("");
  const [file,              setFile]              = useState(null);
  const [loading,           setLoading]           = useState(false);
  const [stepIdx,           setStepIdx]           = useState(0);
  const [error,             setError]             = useState("");
  const [result,            setResult]            = useState(null);
  const [dragging,          setDragging]          = useState(false);
  const [prospectEmail,     setProspectEmail]     = useState("");

  const fileInput = useRef();
  const stepTimer = useRef();

  function pickFile(f) {
    if (!f || f.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
    setFile(f); setError(""); setResult(null);
  }

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

      const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const { error } = await sb().auth.signInWithOtp({
        email: subscriberEmail,
        options: { emailRedirectTo: `${base}/auth/callback` },
      });
      if (error) throw new Error(error.message);
      setMagicSent(true);
    } catch (err) {
      setSubError(err.message || "Could not send the sign-in link.");
    } finally {
      setSubLoading(false);
    }
  }

  async function signInWithGoogle() {
    setSubError("");
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error } = await sb().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${base}/auth/callback` },
    });
    if (error) setSubError(error.message);
  }

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

  async function generate() {
    if (!file) { setError("Upload a LinkedIn PDF first."); return; }
    if (!senderName.trim() || !companyUrl.trim() || !productDescription.trim()) {
      setError("Fill in your name, company URL, and what your product does — they tailor the email.");
      return;
    }
    setLoading(true); setError(""); setResult(null); setStepIdx(0);

    let i = 0;
    stepTimer.current = setInterval(() => {
      i = Math.min(i + 1, STEPS.length - 1);
      setStepIdx(i);
    }, 4000);

    try {
      const b64 = await fileToBase64(file);
      const resp = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: b64, senderName, companyUrl, productDescription })
      });

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
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      if (data.link_line && companyUrl) {
        const normUrl  = /^https?:\/\//i.test(companyUrl) ? companyUrl : `https://${companyUrl}`;
        const linkText = domainFromUrl(normUrl);
        const mdLink   = `[${linkText}](${normUrl})`;
        if (/\[[^\]]+\]\([^)]+\)/.test(data.link_line)) {
          data.link_line = data.link_line.replace(/\[[^\]]+\]\([^)]+\)/g, mdLink);
        } else {
          const withLink = data.link_line.replace(linkText, mdLink);
          data.link_line = withLink !== data.link_line
            ? withLink
            : data.link_line.trimEnd().replace(/\.$/, "") + ` ${mdLink}.`;
        }
      }
      setResult(data);
      refreshBalance();
      loadRecent();
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      clearInterval(stepTimer.current);
      setLoading(false);
    }
  }

  function reset() {
    setFile(null); setResult(null); setError(""); setStepIdx(0); setProspectEmail("");
  }

  return (
    <div className="app-shell">
      <div className="app-inner">

        {/* HEADER */}
        <header className="app-header">
          <span className="app-header__eyebrow">Cold Outreach Studio · v3</span>
          <h1 className="app-header__h1">
            Cold Outreach<br />
            <span className="app-header__h1-italic">Studio</span>
          </h1>
          <p className="app-header__desc">
            Upload a LinkedIn PDF → the app researches the prospect, finds a real recent signal, and writes the email. You verify, you send.
          </p>
        </header>

        {/* CREDIT COUNTER */}
        {session && balance && (
          <div className="credit-counter">
            {balance.free_remaining > 0
              ? `${balance.free_remaining} free ${balance.free_remaining === 1 ? "email" : "emails"} left`
              : `${balance.paid_credits} ${balance.paid_credits === 1 ? "email" : "emails"} left`}
          </div>
        )}

        {/* GATE */}
        {!authReady ? (
          <div className="rise gate-card">
            <p className="gate-desc">Loading…</p>
          </div>
        ) : !session ? (
          <div className="rise gate-card">
            <div className="gate-lock">
              <Lock size={18} color={ink} />
            </div>
            <h2 className="gate-heading">Sign in to start</h2>
            <p className="gate-desc">
              Continue with Google — one click, no password.
            </p>
            <div className="gate-form">
              <button type="button" className="btn-primary" onClick={signInWithGoogle}>
                <GoogleMark />
                Continue with Google
              </button>
              {subError && <p className="gate-error">⚠ {subError}</p>}

              <div className="gate-divider"><span>or use email</span></div>

              <form onSubmit={handleSubscribe} className="gate-emailform">
                <input
                  type="email"
                  className="form-input"
                  placeholder="name@company.com"
                  value={subscriberEmail}
                  onChange={e => setSubscriberEmail(e.target.value)}
                  disabled={subLoading}
                  required
                />
                <button type="submit" className="btn-secondary" disabled={subLoading}>
                  {subLoading ? "Sending link..." : "Email me a magic link"}
                </button>
              </form>
              {magicSent && (
                <p className="gate-desc" style={{ marginTop: 4, marginBottom: 0 }}>
                  ✓ Check your inbox for the sign-in link.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* PAYWALL */}
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

            {/* MAIN FORM */}
            {!result && !loading && !showPaywall && (
              <div className="results-stack">

                {/* Tutorial toggle */}
                <div className="tutorial-toggle">
                  <div className="tutorial-toggle__row" onClick={() => setTutorialOpen(true)}>
                    <span className="tutorial-toggle__label">
                      How to export your LinkedIn profile as a PDF
                    </span>
                    <ChevronDown size={16} color={ink} />
                  </div>
                </div>

                {/* Tutorial modal */}
                {tutorialOpen && (
                  <div className="tutorial-backdrop" onClick={() => setTutorialOpen(false)}>
                    <div className="tutorial-modal" onClick={e => e.stopPropagation()}>
                      <div className="tutorial-modal__header">
                        <span className="tutorial-toggle__label">
                          How to export your LinkedIn profile as a PDF
                        </span>
                        <button className="btn-close" onClick={() => setTutorialOpen(false)}>
                          Close
                        </button>
                      </div>
                      <div className="tutorial-modal__body">
                        <iframe
                          src="/linkedin-pdf-tutorial.html"
                          className="tutorial-iframe"
                          title="LinkedIn PDF export tutorial"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Your Details */}
                <div className="details-card">
                  <span className="details-card__heading">Your details — all required, they tailor the email</span>
                  <div className="details-field">
                    <label className="form-label">Your name <span className="req">*</span></label>
                    <input className="form-input" placeholder="e.g. Alex Johnson" value={senderName} onChange={e => setSenderName(e.target.value)} required />
                  </div>
                  <div className="details-field">
                    <label className="form-label">Company URL <span className="req">*</span></label>
                    <input className="form-input" placeholder="e.g. https://acmecorp.com" value={companyUrl} onChange={e => setCompanyUrl(e.target.value)} required />
                  </div>
                  <div className="details-field">
                    <label className="form-label">What does your product do? <span className="req">*</span></label>
                    <input className="form-input" placeholder="e.g. We help B2B sales teams book more meetings by turning prospect research into personalised emails in seconds" value={productDescription} onChange={e => setProductDescription(e.target.value)} required />
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  className={`drop-zone${dragging ? " drop-zone--active" : ""}`}
                  onClick={() => fileInput.current.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
                >
                  <input ref={fileInput} type="file" accept="application/pdf" style={{ display: "none" }}
                    onChange={e => pickFile(e.target.files[0])} />
                  <div className="drop-zone__content">
                    {file ? (
                      <>
                        <FileText size={30} color={choc} />
                        <span className="drop-zone__title">{file.name}</span>
                        <span className="drop-zone__hint">Click to swap · LinkedIn → More… → Save to PDF</span>
                      </>
                    ) : (
                      <>
                        <Upload size={30} color={mute} />
                        <span className="drop-zone__title">Drop the prospect's LinkedIn PDF here</span>
                        <span className="drop-zone__hint">or click to browse · LinkedIn → More… → Save to PDF</span>
                      </>
                    )}
                  </div>
                </div>

                {error && <p className="form-error">⚠ {error}</p>}

                <button type="button" className="btn-primary" onClick={generate}
                  disabled={!file || !senderName.trim() || !companyUrl.trim() || !productDescription.trim()}>
                  <Search size={16} /> Research prospect &amp; write email
                </button>
              </div>
            )}

            {/* RECENT EMAILS */}
            {!result && !loading && !showPaywall && recent.length > 0 && (
              <div className="recent-card">
                <span className="recent-card__heading">Your recent emails</span>
                <p className="recent-card__sub">Sent one? Tell us if it got a reply — it helps us learn what works.</p>
                <ul className="recent-list">
                  {recent.map(r => {
                    const tier = SIGNAL_TIERS[r.signal_tier] || SIGNAL_TIERS.general;
                    const name = r.output?.prospect_name || "Prospect";
                    const company = r.output?.prospect_company;
                    return (
                      <li key={r.id} className="recent-item">
                        <div className="recent-item__main">
                          <span className="recent-item__name">{name}</span>
                          {company && <span className="recent-item__company"> · {company}</span>}
                          <span className={`signal-tier ${tier.className} recent-item__tier`}>{tier.label}</span>
                        </div>
                        <div className="recent-item__side">
                          <span className="recent-item__date">{timeAgo(r.created_at)}</span>
                          {r.replied === true || r.replied === false ? (
                            <span className="recent-item__recorded">
                              <span className={`recent-item__outcome${r.replied ? " recent-item__outcome--yes" : ""}`}>
                                {r.replied ? "Replied ✓" : "No reply"}
                              </span>
                              <button type="button" className="reply-undo" onClick={() => markReply(r.id, null)}>Undo</button>
                            </span>
                          ) : (
                            <span className="recent-item__reply">
                              <button type="button" className="reply-btn" title="Got a reply" onClick={() => markReply(r.id, true)}>👍</button>
                              <button type="button" className="reply-btn" title="No reply" onClick={() => markReply(r.id, false)}>👎</button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}

        {/* LOADING */}
        {loading && (
          <div className="loading-card">
            <p className="loading-card__eyebrow">Working…</p>
            <div className="loading-steps">
              {STEPS.map((s, i) => {
                const Icon    = s.icon;
                const done    = i < stepIdx;
                const current = i === stepIdx;
                return (
                  <div key={i} className="loading-step" style={{ opacity: done ? 0.4 : current ? 1 : 0.25 }}>
                    <div className={`loading-step__icon${current ? " loading-step__icon--current" : done ? " loading-step__icon--done" : ""}`}>
                      {current
                        ? <span className="loading-spinner" />
                        : <Icon size={14} color={done ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)"} />
                      }
                    </div>
                    <span className={`loading-step__label${current ? " loading-step__label--current" : ""}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="loading-card__footer">
              This takes 20–40 seconds — the app is searching the web for real, recent news about your prospect.
            </p>
          </div>
        )}

        {/* RESULTS */}
        {result && !loading && (
          <div className="results-stack">

            {/* Prospect identified */}
            <div className="rise prospect-card">
              <Sparkles size={16} color={amber} />
              <div className="prospect-card__text">
                <span className="prospect-card__eyebrow">Prospect identified</span>
                <span className="prospect-card__name">{result.prospect_name}</span>
                <span className="prospect-card__meta"> · {result.prospect_title} at {result.prospect_company}</span>
              </div>
            </div>

            {/* Signal card */}
            <div className="rise signal-card" style={{ animationDelay: ".05s" }}>
              <span className="signal-card__watermark">now</span>
              <div className="signal-card__header">
                <span className="signal-card__dot" />
                <span className="signal-card__eyebrow">The Signal — Why Now</span>
                {(() => {
                  const tier = SIGNAL_TIERS[result.signal_tier] || SIGNAL_TIERS.general;
                  return <span className={`signal-tier ${tier.className}`}>{tier.label}</span>;
                })()}
                {result.signal_date && (
                  <span className="signal-card__date">{result.signal_date}</span>
                )}
              </div>
              <p className="signal-card__headline">{result.signal_headline}</p>
              <p className="signal-card__detail">{result.signal_detail}</p>
              {result.signal_source_url && (
                <a href={result.signal_source_url} target="_blank" rel="noreferrer" className="signal-card__link">
                  <ExternalLink size={13} />
                  Verify source · {result.signal_source_name || "View article"}
                </a>
              )}
            </div>

            {/* Email card */}
            <div className="rise email-card" style={{ animationDelay: ".1s" }}>
              <div className="email-card__header">
                <span className="email-card__eyebrow">Output · six-part framework</span>
                <span className="email-card__title">Your cold email</span>
              </div>
              <div className="email-card__body">
                <div>
                  <span className="form-label">Subject line</span>
                  <p className="email-subject">{result.subject}</p>
                </div>
                <p className="email-greeting">{result.greeting}</p>
                {EMAIL_PARTS.map(([key, label]) => (
                  <div key={key} className="email-part">
                    <span className="email-part__label">{label}</span>
                    <p className="email-part__text"><RichText text={result[key]} /></p>
                  </div>
                ))}
                <p className="email-sign-off">Best,<br /><strong>{senderName || "Alex Johnson"}</strong></p>
              </div>
            </div>

            {/* Send panel */}
            <div className="send-panel">
              <div>
                <label className="form-label">Prospect's email (optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="prospect@company.com"
                  value={prospectEmail}
                  onChange={e => setProspectEmail(e.target.value)}
                />
              </div>
              <a
                href={buildGmailUrl({
                  prospectEmail,
                  subject: result.subject,
                  parts: EMAIL_PARTS.map(([k]) => result[k] || ""),
                  greeting: result.greeting,
                  senderName: senderName || "Alex Johnson",
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                <Send size={16} /> Send email
              </a>
            </div>

            <button type="button" className="btn-reset" onClick={reset}>
              <RotateCcw size={13} /> Research a new prospect
            </button>
          </div>
        )}

        <footer className="app-footer">Cold Outreach Studio · we save your generated emails, never the uploaded PDF</footer>
      </div>
    </div>
  );
}
