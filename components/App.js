"use client";
import { useState, useRef } from "react";
import { Upload, RotateCcw, Sparkles, FileText, Search, Mail, ExternalLink, Lock, Send } from "lucide-react";
import { buildMailtoUrl } from "../lib/buildMailtoUrl.js";

const cream = "#fcfbf7";
const ink   = "#1a1714";
const choc  = "#2a1d17";
const amber = "#d4af37";
const brown = "#966b43";
const mute  = "#8c857a";
const white = "#ffffff";

const shadow = (n = 5, c = ink) => `${n}px ${n}px 0 ${c}`;

function domainFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
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
        style={{ color: brown, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {m[1]}
      </a>
    );
    return <span key={i}>{p}</span>;
  });
}

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
  const [isSubscribed, setIsSubscribed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("cos_subscribed") === "1";
    }
    return false;
  });
  const [subscriberEmail, setSubscriberEmail] = useState("");
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState("");

  const [senderName, setSenderName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [productDescription, setProductDescription] = useState("");

  const [file,          setFile]          = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [stepIdx,       setStepIdx]       = useState(0);
  const [error,         setError]         = useState("");
  const [result,        setResult]        = useState(null);
  const [dragging,      setDragging]      = useState(false);
  const [prospectEmail, setProspectEmail] = useState("");

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
      const resp = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subscriberEmail })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      localStorage.setItem("cos_subscribed", "1");
      setIsSubscribed(true);
    } catch (err) {
      setSubError(err.message || "Failed to process request.");
    } finally {
      setSubLoading(false);
    }
  }

  async function generate() {
    if (!file) { setError("Upload a LinkedIn PDF first."); return; }
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
        body: JSON.stringify({
          pdfBase64: b64,
          senderName, companyUrl, productDescription
        })
      });

      let data;
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API error (${resp.status}): ${text.slice(0, 200)}`);
      }
      data = await resp.json();
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

  const inp = {
    background: "#eef4ff", border: `2px solid ${ink}`, color: ink,
    outline: "none", padding: "14px 12px", fontSize: 15,
    width: "100%", fontFamily: "inherit",
  };
  const lbl = {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.1em", color: mute, display: "block", marginBottom: 5,
  };

  return (
    <div style={{ background: cream, minHeight: "100vh", color: ink, fontFamily: "'Archivo', system-ui, sans-serif", padding: "28px 16px 60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,500&family=Archivo:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box}
        @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
        .rise{animation:rise .5s cubic-bezier(.2,.8,.3,1) both}
        ::selection{background:${ink};color:${cream}}
        input, button { font-family: inherit; }
      `}</style>

      <div style={{ maxWidth: 580, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* HEADER */}
        <header style={{ borderBottom: `4px solid ${ink}`, paddingBottom: 22 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.3em", textTransform: "uppercase", color: mute }}>
            Cold Outreach Studio · v3
          </span>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "clamp(2.2rem,9vw,3.2rem)", lineHeight: .95, fontWeight: 600, margin: "6px 0 10px", letterSpacing: "-0.01em" }}>
            Cold Outreach<br />
            <span style={{ fontStyle: "italic", color: choc }}>Studio</span>
          </h1>
          <p style={{ fontSize: 13.5, color: mute, maxWidth: 440, lineHeight: 1.55 }}>
            Upload a LinkedIn PDF → the app researches the prospect, finds a real recent signal, and writes the email. You verify, you send.
          </p>
        </header>

        {/* SUBSCRIBER GATE WALL */}
        {!isSubscribed ? (
          <div className="rise" style={{ background: white, border: `2px solid ${ink}`, boxShadow: shadow(6, choc), padding: "40px 32px", position: "relative" }}>
            <div style={{ width: 44, height: 44, border: `2px solid #d4af37`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Lock size={18} color={ink} />
            </div>
            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, fontWeight: 600, margin: "0 0 8px", textAlign: "center" }}>Unlock Access to the Studio</h2>
            <p style={{ fontSize: 13.5, color: mute, maxWidth: 380, margin: "0 auto 28px", lineHeight: 1.5, textAlign: "center" }}>
              Join our network of B2B professionals. Drop your email below to instantly activate the 6-part AI outreach generator.
            </p>

            <form onSubmit={handleSubscribe} style={{ maxWidth: 440, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
              <input
                type="email"
                style={inp}
                placeholder="name@company.com"
                value={subscriberEmail}
                onChange={e => setSubscriberEmail(e.target.value)}
                disabled={subLoading}
                required
              />
              {subError && <p style={{ fontSize: 12, color: "#c00", margin: 0, textAlign: "left" }}>⚠ {subError}</p>}
              <button
                type="submit"
                disabled={subLoading}
                style={{
                  background: choc, color: cream, border: `2px solid ${ink}`,
                  boxShadow: shadow(3, amber), padding: "15px 20px",
                  fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                {subLoading ? "Activating..." : "Get Free Access"}
              </button>
            </form>
          </div>
        ) : (
          /* CORE ENGINE INTERFACE */
          <>
            {!result && !loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ background: white, border: `2px solid ${ink}`, boxShadow: shadow(4), padding: "20px 20px 24px" }}>
                  <p style={{ ...lbl, marginBottom: 16, fontSize: 9, letterSpacing: "0.18em", borderBottom: `1px solid #e7e2d8`, paddingBottom: 10 }}>
                    Your details — sender metadata
                  </p>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Your name</label>
                    <input style={{...inp, background: cream}} placeholder="e.g. Alex Johnson" value={senderName} onChange={e => setSenderName(e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Company URL</label>
                    <input style={{...inp, background: cream}} placeholder="e.g. https://acmecorp.com" value={companyUrl} onChange={e => setCompanyUrl(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>What does your product do?</label>
                    <input style={{...inp, background: cream}} placeholder="e.g. We help B2B sales teams book more meetings by turning prospect research into personalised emails in seconds" value={productDescription} onChange={e => setProductDescription(e.target.value)} />
                  </div>
                </div>

                <div
                  onClick={() => fileInput.current.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
                  style={{
                    border: `2px dashed ${dragging ? ink : "#c8c2b6"}`,
                    background: dragging ? "#f5f0e8" : white,
                    padding: "40px 24px", textAlign: "center", cursor: "pointer",
                    transition: "all .15s", boxShadow: dragging ? shadow(4) : "none",
                  }}
                >
                  <input ref={fileInput} type="file" accept="application/pdf" style={{ display: "none" }}
                    onChange={e => pickFile(e.target.files[0])} />
                  {file ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <FileText size={30} color={choc} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{file.name}</span>
                      <span style={{ fontSize: 12, color: mute }}>Click to swap · LinkedIn → More… → Save to PDF</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <Upload size={30} color={mute} />
                      <span style={{ fontWeight: 700, fontSize: 15 }}>Drop the prospect's LinkedIn PDF here</span>
                      <span style={{ fontSize: 12, color: mute }}>or click to browse · LinkedIn → More… → Save to PDF</span>
                    </div>
                  )}
                </div>

                {error && (
                  <p style={{ background: "#fff0f0", border: `2px solid #c00`, padding: "10px 14px", fontSize: 13, color: "#900", margin: 0 }}>
                    ⚠ {error}
                  </p>
                )}

                <button type="button" onClick={generate} disabled={!file}
                  style={{
                    background: choc, color: cream, border: `2px solid ${ink}`,
                    boxShadow: shadow(4, amber), padding: "16px 24px",
                    fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                    cursor: file ? "pointer" : "not-allowed", opacity: !file ? 0.45 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  }}
                >
                  <Search size={16} /> Research prospect &amp; write email
                </button>
              </div>
            )}
          </>
        )}

        {/* LOADING */}
        {loading && (
          <div style={{ background: choc, border: `2px solid ${ink}`, boxShadow: shadow(5), padding: "32px 28px" }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", color: amber, marginBottom: 24, margin: "0 0 24px" }}>
              Working…
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done    = i < stepIdx;
                const current = i === stepIdx;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, opacity: done ? 0.4 : current ? 1 : 0.25, transition: "opacity .4s" }}>
                    <div style={{ width: 32, height: 32, background: current ? amber : done ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)", border: `1.5px solid ${current ? amber : "rgba(255,255,255,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {current
                        ? <span style={{ width: 14, height: 14, border: `2px solid ${choc}`, borderTopColor: "transparent", borderRadius: 99, display: "inline-block", animation: "spin .75s linear infinite" }} />
                        : <Icon size={14} color={done ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)"} />
                      }
                    </div>
                    <span style={{ fontSize: 14, fontWeight: current ? 700 : 400, color: current ? cream : "rgba(255,255,255,0.45)", animation: current ? "blink 2s ease-in-out infinite" : "none" }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)", marginTop: 28, lineHeight: 1.5, marginBottom: 0 }}>
              This takes 20–40 seconds — the app is searching the web for real, recent news about your prospect.
            </p>
          </div>
        )}

        {/* RESULT */}
        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="rise" style={{ background: white, border: `2px solid ${ink}`, boxShadow: shadow(3), padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <Sparkles size={16} color={amber} />
              <div>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: mute, display: "block" }}>Prospect identified</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{result.prospect_name}</span>
                <span style={{ color: mute, fontSize: 13 }}> · {result.prospect_title} at {result.prospect_company}</span>
              </div>
            </div>

            {/* SIGNAL CARD */}
            <div className="rise" style={{ background: choc, color: cream, border: `2px solid ${ink}`, boxShadow: shadow(6), padding: "26px 24px 22px", position: "relative", overflow: "hidden", animationDelay: ".05s" }}>
              <span style={{ position: "absolute", right: 10, top: -8, fontFamily: "'Fraunces',serif", fontStyle: "italic", fontSize: 120, color: "rgba(255,255,255,0.04)", lineHeight: 1, pointerEvents: "none", userSelect: "none" }}>now</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: amber, animation: "pulse 1.8s ease-in-out infinite" }} />
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: amber }}>The Signal — Why Now</span>
                {result.signal_date && (
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.08)", padding: "2px 8px" }}>
                    {result.signal_date}
                  </span>
                )}
              </div>
              <p style={{ fontFamily: "'Fraunces',serif", fontStyle: "italic", fontSize: "clamp(1.1rem,4vw,1.45rem)", lineHeight: 1.45, color: "#f4eee6", margin: "0 0 12px" }}>
                {result.signal_headline}
              </p>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,0.72)", margin: "0 0 18px" }}>
                {result.signal_detail}
              </p>
              {result.signal_source_url && result.signal_headline !== "No signal found in the last 2 months" && (
                <a href={result.signal_source_url} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(212,175,55,0.15)", border: `1.5px solid ${amber}`, color: amber, padding: "8px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none", letterSpacing: "0.04em" }}>
                  <ExternalLink size={13} />
                  Verify source · {result.signal_source_name || "View article"}
                </a>
              )}
            </div>

            {/* EMAIL CARD */}
            <div className="rise" style={{ background: white, border: `2px solid ${ink}`, boxShadow: shadow(6), animationDelay: ".1s" }}>
              <div style={{ padding: "16px 20px", borderBottom: `2px solid ${ink}` }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: mute, display: "block" }}>Output · six-part framework</span>
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: "1.15rem", fontWeight: 600 }}>Your cold email</span>
              </div>

              <div style={{ padding: "20px 20px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <span style={lbl}>Subject line</span>
                  <p style={{ background: cream, border: `1.5px solid ${ink}`, padding: "10px 12px", fontWeight: 700, fontSize: 14, margin: 0 }}>{result.subject}</p>
                </div>
                <p style={{ fontWeight: 600, margin: 0, fontSize: 14 }}>{result.greeting}</p>
                {EMAIL_PARTS.map(([key, label]) => (
                  <div key={key} style={{ borderLeft: `2px solid #e7e2d8`, paddingLeft: 16 }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: brown, display: "block", marginBottom: 5, fontFamily: "monospace" }}>{label}</span>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: ink }}><RichText text={result[key]} /></p>
                  </div>
                ))}
                <p style={{ margin: 0, fontSize: 14 }}>Best,<br /><strong>{senderName || "Alex Johnson"}</strong></p>
              </div>
            </div>

            {/* SEND PANEL */}
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

            <button type="button" onClick={reset}
              style={{ background: "transparent", border: `2px dashed #c8c2b6`, color: mute, padding: "13px", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <RotateCcw size={13} /> Research a new prospect
            </button>
          </div>
        )}

        <footer style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#ccc5ba", textAlign: "center", borderTop: `1px solid #e7e2d8`, paddingTop: 16 }}>
          Cold Outreach Studio · no data stored
        </footer>
      </div>
    </div>
  );
}
