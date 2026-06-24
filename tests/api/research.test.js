import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { callAnthropic, callGemini, POST } from "../../app/api/research/route.js";

describe("callAnthropic", () => {
  let originalKey;

  beforeEach(() => {
    originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("returns parsed JSON when Anthropic responds successfully", async () => {
    const mockPayload = { prospect_name: "Jane Smith", subject: "Test" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(mockPayload) }],
      }),
    });

    const result = await callAnthropic("base64pdf==", "prompt text");
    expect(result).toEqual(mockPayload);
  });

  it("throws with .status when Anthropic returns a non-OK response", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      text: async () => "credits exhausted",
    });

    await expect(callAnthropic("base64pdf==", "prompt")).rejects.toMatchObject({
      status: 402,
    });
  });

  it("parses JSON wrapped in markdown fences", async () => {
    const mockPayload = { prospect_name: "Alex" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "```json\n" + JSON.stringify(mockPayload) + "\n```" }],
      }),
    });

    const result = await callAnthropic("base64pdf==", "prompt");
    expect(result.prospect_name).toBe("Alex");
  });
});

describe("callGemini", () => {
  let originalKey;

  beforeEach(() => {
    originalKey = process.env.GOOGLE_AI_API_KEY;
    process.env.GOOGLE_AI_API_KEY = "test-gemini-key";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.GOOGLE_AI_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("returns parsed JSON when Gemini responds successfully", async () => {
    const mockPayload = { prospect_name: "Jane Smith", subject: "Test" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
      }),
    });

    const result = await callGemini("base64pdf==", "prompt text");
    expect(result).toEqual(mockPayload);
  });

  it("uses the GOOGLE_AI_API_KEY in the request URL", async () => {
    const mockPayload = { prospect_name: "Jane" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
      }),
    });

    await callGemini("base64pdf==", "prompt");
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain("key=test-gemini-key");
  });

  it("throws with .status on non-OK response", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "server error",
    });

    await expect(callGemini("base64pdf==", "prompt")).rejects.toMatchObject({
      status: 500,
    });
  });

  it("picks the last text part from candidates", async () => {
    const mockPayload = { prospect_name: "Final" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [
              { text: "intermediate text" },
              { text: JSON.stringify(mockPayload) },
            ],
          },
        }],
      }),
    });

    const result = await callGemini("base64pdf==", "prompt");
    expect(result.prospect_name).toBe("Final");
  });
});

describe("POST handler — provider fallback", () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      SLACK_ERROR_WEBHOOK_URL: process.env.SLACK_ERROR_WEBHOOK_URL,
    };
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GOOGLE_AI_API_KEY = "test-gemini-key";
    process.env.SLACK_ERROR_WEBHOOK_URL = "";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
    vi.restoreAllMocks();
  });

  function makeRequest(overrides = {}) {
    return {
      json: async () => ({
        pdfBase64: "dGVzdA==",
        senderName: "Test Sender",
        companyUrl: "https://example.com",
        productDescription: "Test product",
        ...overrides,
      }),
    };
  }

  it("returns Anthropic result when Anthropic succeeds", async () => {
    const mockPayload = { prospect_name: "Jane", subject: "Hi Jane" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify(mockPayload) }] }),
    });

    const response = await POST(makeRequest());
    const body = await response.json();
    expect(body.prospect_name).toBe("Jane");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to Gemini when Anthropic returns 402", async () => {
    const mockPayload = { prospect_name: "Jane", subject: "Hi Jane" };
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 402, text: async () => "credits exhausted" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
        }),
      });

    const response = await POST(makeRequest());
    const body = await response.json();
    expect(body.prospect_name).toBe("Jane");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to Gemini when Anthropic returns 429", async () => {
    const mockPayload = { prospect_name: "Jane" };
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
        }),
      });

    const response = await POST(makeRequest());
    expect((await response.json()).prospect_name).toBe("Jane");
  });

  it("does NOT fall back when Anthropic returns 400", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad request" });

    const response = await POST(makeRequest());
    expect(response.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when both providers fail", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "gemini error" });

    const response = await POST(makeRequest());
    expect(response.status).toBe(500);
  });

  it("skips Anthropic and goes straight to Gemini when ANTHROPIC_API_KEY is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const mockPayload = { prospect_name: "Jane" };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }],
      }),
    });

    const response = await POST(makeRequest());
    expect((await response.json()).prospect_name).toBe("Jane");
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
  });

  it("returns 500 immediately when both keys are absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;

    const response = await POST(makeRequest());
    expect(response.status).toBe(500);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
