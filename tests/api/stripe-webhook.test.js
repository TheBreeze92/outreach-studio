import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockConstructEvent = vi.fn();
const mockAddCredits = vi.fn();
const mockInsert = vi.fn();

vi.mock("stripe", () => ({
  default: vi.fn(function () {
    return { webhooks: { constructEvent: (...a) => mockConstructEvent(...a) } };
  }),
}));
vi.mock("../../lib/supabaseAdmin.js", () => ({
  getAdminClient: () => ({ from: () => ({ insert: (...a) => mockInsert(...a) }) }),
}));
vi.mock("../../lib/credits.js", () => ({ addCredits: (...a) => mockAddCredits(...a) }));

import { POST } from "../../app/api/stripe-webhook/route.js";

function makeReq() {
  return {
    headers: { get: () => "sig-header" },
    text: async () => "raw-body",
  };
}

describe("POST /api/stripe-webhook", () => {
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    mockConstructEvent.mockReset();
    mockAddCredits.mockReset().mockResolvedValue(undefined);
    mockInsert.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => { process.env = saved; vi.clearAllMocks(); });

  it("returns 400 on an invalid signature", async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error("bad sig"); });
    const response = await POST(makeReq());
    expect(response.status).toBe(400);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });

  it("adds 50 credits on checkout.session.completed", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1" } },
    });
    const response = await POST(makeReq());
    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith({ event_id: "evt_1" });
    expect(mockAddCredits).toHaveBeenCalledWith(expect.anything(), "user-1", 50);
  });

  it("is idempotent — a duplicate event adds no credits", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1" } },
    });
    mockInsert.mockResolvedValue({ error: { code: "23505" } });
    const response = await POST(makeReq());
    expect(response.status).toBe(200);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });

  it("ignores unrelated event types", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_2",
      type: "payment_intent.created",
      data: { object: {} },
    });
    const response = await POST(makeReq());
    expect(response.status).toBe(200);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });
});
