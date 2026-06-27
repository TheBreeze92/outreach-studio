import { vi, describe, it, expect } from "vitest";
import { FREE_LIMIT, getBalance, consumeCredit, addCredits } from "../../lib/credits.js";

function fakeAdmin(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
}

describe("getBalance", () => {
  it("computes free_remaining from free_used and returns paid_credits", async () => {
    const admin = fakeAdmin(async () => ({
      data: { user_id: "u1", free_used: 1, paid_credits: 7 },
      error: null,
    }));
    const balance = await getBalance(admin, "u1");
    expect(balance).toEqual({ free_remaining: FREE_LIMIT - 1, paid_credits: 7 });
    expect(admin.rpc).toHaveBeenCalledWith("get_or_create_credits", { uid: "u1" });
  });

  it("never returns a negative free_remaining", async () => {
    const admin = fakeAdmin(async () => ({
      data: { free_used: 9, paid_credits: 0 },
      error: null,
    }));
    expect((await getBalance(admin, "u1")).free_remaining).toBe(0);
  });

  it("unwraps an array-shaped rpc result", async () => {
    const admin = fakeAdmin(async () => ({
      data: [{ free_used: 0, paid_credits: 0 }],
      error: null,
    }));
    expect((await getBalance(admin, "u1")).free_remaining).toBe(FREE_LIMIT);
  });

  it("throws when rpc returns an error", async () => {
    const admin = fakeAdmin(async () => ({ data: null, error: { message: "boom" } }));
    await expect(getBalance(admin, "u1")).rejects.toThrow(/boom/);
  });
});

describe("consumeCredit", () => {
  it("returns true when a credit was consumed", async () => {
    const admin = fakeAdmin(async () => ({ data: true, error: null }));
    expect(await consumeCredit(admin, "u1")).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("consume_credit", { uid: "u1" });
  });

  it("returns false when none was consumed", async () => {
    const admin = fakeAdmin(async () => ({ data: false, error: null }));
    expect(await consumeCredit(admin, "u1")).toBe(false);
  });
});

describe("addCredits", () => {
  it("calls add_credits with the amount", async () => {
    const admin = fakeAdmin(async () => ({ data: null, error: null }));
    await addCredits(admin, "u1", 50);
    expect(admin.rpc).toHaveBeenCalledWith("add_credits", { uid: "u1", amount: 50 });
  });

  it("throws when rpc returns an error", async () => {
    const admin = fakeAdmin(async () => ({ data: null, error: { message: "nope" } }));
    await expect(addCredits(admin, "u1", 50)).rejects.toThrow(/nope/);
  });
});
