import { describe, it, expect, vi } from "vitest";
import { logGeneration, setReplied, normaliseTier } from "../../lib/generations.js";

function makeInsertAdmin(result) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { admin: { from }, insert, from };
}

function makeUpdateAdmin(result) {
  const eq2 = vi.fn().mockResolvedValue(result);
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const update = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ update }));
  return { admin: { from }, update, eq1, eq2 };
}

describe("normaliseTier", () => {
  it("passes through valid tiers", () => {
    expect(normaliseTier("hot")).toBe("hot");
    expect(normaliseTier("soft")).toBe("soft");
    expect(normaliseTier("general")).toBe("general");
  });

  it("defaults unknown or missing tiers to general", () => {
    expect(normaliseTier("banana")).toBe("general");
    expect(normaliseTier(undefined)).toBe("general");
    expect(normaliseTier(null)).toBe("general");
  });
});

describe("logGeneration", () => {
  it("inserts the row and returns the new id", async () => {
    const { admin, insert, from } = makeInsertAdmin({ data: { id: "gen-1" }, error: null });
    const id = await logGeneration(admin, {
      userId: "u1",
      inputs: { senderName: "S" },
      signalTier: "hot",
      signalHeadline: "H",
      output: { subject: "x" },
    });
    expect(id).toBe("gen-1");
    expect(from).toHaveBeenCalledWith("generations");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "u1",
      signal_tier: "hot",
      signal_headline: "H",
    }));
  });

  it("normalises an unknown tier to general before inserting", async () => {
    const { admin, insert } = makeInsertAdmin({ data: { id: "gen-2" }, error: null });
    await logGeneration(admin, { userId: "u1", signalTier: "weird" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ signal_tier: "general" }));
  });

  it("throws when the insert errors", async () => {
    const { admin } = makeInsertAdmin({ data: null, error: { message: "boom" } });
    await expect(logGeneration(admin, { userId: "u1" })).rejects.toThrow("logGeneration failed: boom");
  });
});

describe("setReplied", () => {
  it("updates the row scoped to id and user", async () => {
    const { admin, update, eq1, eq2 } = makeUpdateAdmin({ error: null });
    await setReplied(admin, { id: "gen-1", userId: "u1", replied: true });
    expect(update).toHaveBeenCalledWith({ replied: true });
    expect(eq1).toHaveBeenCalledWith("id", "gen-1");
    expect(eq2).toHaveBeenCalledWith("user_id", "u1");
  });

  it("throws when the update errors", async () => {
    const { admin } = makeUpdateAdmin({ error: { message: "nope" } });
    await expect(setReplied(admin, { id: "x", userId: "u", replied: false }))
      .rejects.toThrow("setReplied failed: nope");
  });
});
