export const maxDuration = 60;

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  try {
    const { pdfBase64, senderName, companyUrl, productDescription } = await req.json();

    const sender = senderName || "Alex Johnson";
    const url    = companyUrl || "https://yourcompany.com";
    let company;
    try { company = new URL(url).hostname.replace(/^www\./, ""); } catch { company = "your company"; }
    const product = productDescription || "We help businesses grow through tailored outreach strategies";

    const prompt = `You are an elite B2B sales researcher and cold-email copywriter.

STEP 1 — EXTRACT FROM PDF
Read the attached LinkedIn profile PDF. Extract:
- The prospect's full name
- Their current job title
- Their current employer / company name

STEP 2 — WEB RESEARCH (use your web_search tool)
The current date is June 2026. You are hunting for a purchasing signal from the last TWO MONTHS only (May 2026 or June 2026).

RECENCY RULES — NON-NEGOTIABLE:
- ONLY use signals clearly dated May 2026 or June 2026
- Anything from 2025 or earlier is TOO OLD — discard it entirely
- April 2026 is borderline — only fall back to it if absolutely nothing from May/June exists
- NEVER stretch or recycle old news. If nothing recent exists, say so honestly.
- Always check the publication date of any article before using it as a signal

Good signals to look for (must be May or June 2026):
- New funding round or investment
- New product or service launch
- Rebrand or strategic pivot
- New senior hire or leadership change
- Major campaign win, partnership, or award
- Expansion into a new market
- A recent interview, podcast, or press feature of the prospect themselves

Run a maximum of 2 focused searches before concluding. Suggested search queries (adapt to the actual name/company):
1. "[Company name] news May OR June 2026"
2. "[Prospect name] [Company] 2026"

If you cannot find anything from May or June 2026, set signal_headline to "No signal found in the last 2 months" and explain what you searched for in signal_detail. Still write the best possible email using general knowledge of the company.

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
  "signal_date": "exact date of the signal e.g. 'June 2026' or 'May 2026' — must be 2026",
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
- If you cannot find a signal from May or June 2026, set signal_headline to "No signal found in the last 2 months" and explain what you searched in signal_detail — do NOT use signals from 2025 or earlier
- Every email field must be populated
- Return ONLY valid JSON`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
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
            { type: "text", text: prompt }
          ]
        }]
      })
    });
    clearTimeout(timer);

    if (!anthropicResp.ok) {
      const err = await anthropicResp.text();
      return Response.json({ error: `Anthropic API error: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const data = await anthropicResp.json();
    const textBlock = [...(data.content || [])].reverse().find(b => b.type === "text");
    if (!textBlock) return Response.json({ error: "No response from API" }, { status: 500 });

    const raw   = textBlock.text.trim();
    const clean = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else return Response.json({ error: "Could not parse response" }, { status: 500 });
    }

    return Response.json(parsed);

  } catch (e) {
    const msg = e.name === "AbortError"
      ? "Research timed out — please try again."
      : e.message || "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
