import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { callAnthropic, callGemini } from "../../app/api/research/route.js";

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
