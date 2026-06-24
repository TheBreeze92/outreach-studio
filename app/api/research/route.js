import { reportError } from "../../../lib/reportError.js";

export const maxDuration = 60;

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
    // Anthropic returns 400 for credit exhaustion; treat it as 402 so the fallback fires
    error.status = (resp.status === 400 && err.includes("credit balance")) ? 402 : resp.status;
    throw error;
  }

  const data = await resp.json();
  const textBlock = [...(data.content || [])].reverse().find(b => b.type === "text");
  if (!textBlock) throw new Error("Anthropic returned no text block");
  return parseJsonResponse(textBlock.text);
}

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

export async function POST(req) {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini    = !!process.env.GOOGLE_AI_API_KEY;

  if (!hasAnthropic && !hasGemini) {
    return Response.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  try {
    const { pdfBase64, senderName, companyUrl, productDescription } = await req.json();

    const sender = senderName || "Alex Johnson";
    const url    = companyUrl || "https://yourcompany.com";
    let company;
    try { company = new URL(url).hostname.replace(/^www\./, ""); } catch { company = "your company"; }
    const product = productDescription || "We help businesses grow through tailored outreach strategies";

    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const now = new Date();
    const currentMonth = MONTHS[now.getMonth()];
    const currentYear  = now.getFullYear();
    const d1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev1Month = MONTHS[d1.getMonth()];
    const prev1Year  = d1.getFullYear();
    const d2 = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prev2Month = MONTHS[d2.getMonth()];
    const prev2Year  = d2.getFullYear();
    const d3 = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const prev3Month = MONTHS[d3.getMonth()];
    const prev3Year  = d3.getFullYear();

    const prompt = `You are an elite B2B sales researcher and cold-email copywriter.

STEP 1 — EXTRACT FROM PDF
Read the attached LinkedIn profile PDF. Extract:
- The prospect's full name
- Their current job title
- Their current employer / company name

STEP 2 — WEB RESEARCH (use your web_search tool)
The current date is ${currentMonth} ${currentYear}. You are hunting for a purchasing signal from the last TWO TO THREE MONTHS (${prev2Month} ${prev2Year}, ${prev1Month} ${prev1Year}, or ${currentMonth} ${currentYear}).

RECENCY RULES — NON-NEGOTIABLE:
- PRIORITISE signals from ${prev1Month} ${prev1Year} or ${currentMonth} ${currentYear}
- ${prev2Month} ${prev2Year} and ${prev3Month} ${prev3Year} are acceptable if nothing more recent exists
- Anything from ${currentYear - 1} or earlier is TOO OLD — discard it entirely
- NEVER stretch or recycle old news. If nothing recent exists, say so honestly.
- Always check the publication date of any article before using it as a signal

Good signals to look for (ideally from the last 2-3 months):
- New funding round or investment
- New product or service launch
- Rebrand or strategic pivot
- New senior hire or leadership change
- Major campaign win, partnership, or award
- Expansion into a new market
- A recent interview, podcast, or press feature of the prospect themselves

Run a maximum of 2 focused searches before concluding. Suggested search queries (adapt to the actual name/company):
1. "[Company name] news ${prev1Month} OR ${currentMonth} ${currentYear}"
2. "[Prospect name] [Company] ${currentYear}"

If you cannot find anything from the last 3 months, set signal_headline to "No recent signal found" and explain what you searched for in signal_detail. Still write the best possible email using the most recent signal you can find, or general knowledge of the company if nothing exists.

SENDER CONTEXT:
- Name: ${sender}
- Company: ${company} (${url})
- Product: ${product}

STEP 3 — WRITE THE EMAIL
Using the real researched signal and the sender context above, write a cold email following this exact 6-part framework:
1. The Hook — an open-ended question about the prospect's strategy or goals (not a yes/no question; provokes thought)
2. The Signal — the "Why Now": reference the specific real-world news or data you found, precisely and credibly
3. The Succinct Intro — one sentence: "I'm ${sender}, [one compelling credibility line drawn from the product description]."
4. The Hyperlink — one short sentence with the company name as a markdown hyperlink. The anchor text MUST be exactly "${company}" — not the URL, not a path segment, not a variation. e.g. "We run [${company}](${url})."
5. The Teaser — a specific, meaty collaboration idea tied directly to the signal; concrete, not vague
6. The Frictionless CTA — propose a 15-min call with a specific suggested time: Thursday afternoon or Friday morning

STEP 4 — RETURN JSON ONLY
Return ONLY this JSON object, no markdown fences, no commentary:

{
  "prospect_name": "full name from PDF",
  "prospect_title": "their job title",
  "prospect_company": "their employer",
  "signal_headline": "one-line headline summarising the signal",
  "signal_detail": "2-3 sentences describing the signal with enough detail the reader can verify it",
  "signal_source_url": "the actual URL of the article or page where you found this signal",
  "signal_source_name": "name of the publication or site (e.g. Campaign, Marketing Week, TechCrunch)",
  "signal_date": "exact date of the signal e.g. '${currentMonth} ${currentYear}' or '${prev1Month} ${prev1Year}'",
  "subject": "email subject line",
  "greeting": "Hi [first name],",
  "hook": "part 1 text",
  "signal_line": "part 2 text — reference the signal specifically",
  "intro": "part 3 — I'm ${sender}, [credibility line from product description].",
  "link_line": "part 4 — short sentence with [${company}](${url}) as the hyperlink",
  "teaser": "part 5 — specific meaty collaboration idea tied to the signal",
  "cta": "part 6 — 15-min call with suggested time: Thursday afternoon or Friday morning"
}

Rules:
- signal_source_url must be a real URL you actually found during web search, not a guess
- If you cannot find a recent signal, set signal_headline to "No recent signal found" and explain what you searched in signal_detail — do NOT use signals from ${currentYear - 1} or earlier
- Every email field must be populated
- Return ONLY valid JSON`;

    let parsed;

    if (hasAnthropic) {
      try {
        parsed = await callAnthropic(pdfBase64, prompt);
      } catch (anthropicErr) {
        const s = anthropicErr.status;
        const shouldFallback = !s || s === 402 || s === 429 || s >= 500;
        if (!shouldFallback || !hasGemini) {
          await reportError("research", anthropicErr);
          return Response.json({ error: "Something went wrong — please try again." }, { status: 500 });
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
      : "Something went wrong — please try again.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
