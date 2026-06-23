import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { reportError } from "../../lib/reportError.js";

describe("reportError", () => {
  let originalUrl;

  beforeEach(() => {
    originalUrl = process.env.SLACK_ERROR_WEBHOOK_URL;
    process.env.SLACK_ERROR_WEBHOOK_URL = "https://hooks.slack.com/test-url";
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    process.env.SLACK_ERROR_WEBHOOK_URL = originalUrl;
    vi.restoreAllMocks();
  });

  it("posts to the Slack webhook with route name and error message", async () => {
    const error = new Error("something broke");
    await reportError("research", error);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/test-url");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.blocks[0].text.text).toBe("🔴 Error in /research");
    expect(body.blocks[1].text.text).toContain("something broke");
  });

  it("does nothing when SLACK_ERROR_WEBHOOK_URL is not set", async () => {
    delete process.env.SLACK_ERROR_WEBHOOK_URL;
    await reportError("research", new Error("silent"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not throw if fetch rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(
      reportError("research", new Error("broken"))
    ).resolves.toBeUndefined();
  });

  it("handles a non-Error object without throwing", async () => {
    await expect(
      reportError("subscribe", "string error")
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
