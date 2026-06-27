import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockGetUser = vi.fn();
const mockSetReplied = vi.fn();

vi.mock("../../lib/supabaseServer.js", () => ({ getUser: (...a) => mockGetUser(...a) }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ getAdminClient: () => ({}) }));
vi.mock("../../lib/generations.js", () => ({ setReplied: (...a) => mockSetReplied(...a) }));
vi.mock("../../lib/reportError.js", () => ({ reportError: vi.fn() }));

import { POST } from "../../app/api/generations/reply/route.js";

function req(body) {
  return { json: async () => body };
}

describe("POST /api/generations/reply", () => {
  beforeEach(() => { mockGetUser.mockReset(); mockSetReplied.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  it("returns 401 when signed out", async () => {
    mockGetUser.mockResolvedValue(null);
    const r = await POST(req({ generation_id: "g1", replied: true }));
    expect(r.status).toBe(401);
    expect(mockSetReplied).not.toHaveBeenCalled();
  });

  it("returns 400 when replied is missing or not a boolean", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    const r = await POST(req({ generation_id: "g1" }));
    expect(r.status).toBe(400);
    expect(mockSetReplied).not.toHaveBeenCalled();
  });

  it("returns 400 when generation_id is missing", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    const r = await POST(req({ replied: true }));
    expect(r.status).toBe(400);
  });

  it("saves the reply for a signed-in user", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    mockSetReplied.mockResolvedValue();
    const r = await POST(req({ generation_id: "g1", replied: true }));
    expect(await r.json()).toEqual({ ok: true });
    expect(mockSetReplied).toHaveBeenCalledWith({}, { id: "g1", userId: "u1", replied: true });
  });

  it("accepts null to undo a recorded outcome", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    mockSetReplied.mockResolvedValue();
    const r = await POST(req({ generation_id: "g1", replied: null }));
    expect(await r.json()).toEqual({ ok: true });
    expect(mockSetReplied).toHaveBeenCalledWith({}, { id: "g1", userId: "u1", replied: null });
  });

  it("returns 500 when the write fails", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    mockSetReplied.mockRejectedValue(new Error("db down"));
    const r = await POST(req({ generation_id: "g1", replied: false }));
    expect(r.status).toBe(500);
  });
});
