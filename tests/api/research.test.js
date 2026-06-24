import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { callAnthropic } from "../../app/api/research/route.js";

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
