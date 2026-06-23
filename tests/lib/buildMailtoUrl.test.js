import { describe, it, expect } from "vitest";
import { buildMailtoUrl } from "../../lib/buildMailtoUrl.js";

const base = {
  prospectEmail: "jane@acme.com",
  subject: "Quick question about Q2",
  parts: [
    "How are you thinking about growth?",
    "I noticed your team just launched a product.",
    "I'm Alex Johnson, founder of Texture Talks.",
    "We run [Texture Talks](https://texturetalks.co.uk).",
    "I'd love to explore a collaboration.",
    "Would Thursday at 2pm work for a 15-min call?",
  ],
  greeting: "Hi Jane,",
  senderName: "Alex Johnson",
};

describe("buildMailtoUrl", () => {
  it("starts with mailto: and the prospect email", () => {
    const url = buildMailtoUrl(base);
    expect(url).toMatch(/^mailto:jane@acme\.com\?/);
  });

  it("encodes the subject correctly", () => {
    const url = buildMailtoUrl(base);
    expect(url).toContain("subject=Quick%20question%20about%20Q2");
  });

  it("strips markdown links to plain text in the body", () => {
    const decoded = decodeURIComponent(buildMailtoUrl(base));
    expect(decoded).toContain("Texture Talks (https://texturetalks.co.uk)");
    expect(decoded).not.toContain("[Texture Talks]");
  });

  it("includes the greeting in the body", () => {
    const decoded = decodeURIComponent(buildMailtoUrl(base));
    expect(decoded).toContain("Hi Jane,");
  });

  it("includes the sign-off with sender name", () => {
    const decoded = decodeURIComponent(buildMailtoUrl(base));
    expect(decoded).toContain("Best,\nAlex Johnson");
  });

  it("omits to: when prospectEmail is empty", () => {
    const url = buildMailtoUrl({ ...base, prospectEmail: "" });
    expect(url).toMatch(/^mailto:\?/);
  });

  it("omits to: when prospectEmail is whitespace only", () => {
    const url = buildMailtoUrl({ ...base, prospectEmail: "   " });
    expect(url).toMatch(/^mailto:\?/);
  });
});
