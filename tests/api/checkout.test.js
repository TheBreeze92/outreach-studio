import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockGetUser = vi.fn();
const mockSessionCreate = vi.fn();

vi.mock("../../lib/supabaseServer.js", () => ({ getUser: (...a) => mockGetUser(...a) }));
vi.mock("stripe", () => ({
  default: vi.fn(function () {
    return { checkout: { sessions: { create: (...a) => mockSessionCreate(...a) } } };
  }),
}));

import { POST } from "../../app/api/checkout/route.js";

describe("POST /api/checkout", () => {
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRICE_ID = "price_123";
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.test";
    mockGetUser.mockReset();
    mockSessionCreate.mockReset();
  });
  afterEach(() => { process.env = saved; vi.clearAllMocks(); });

  it("returns 401 when signed out", async () => {
    mockGetUser.mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(401);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("creates a session stamped with the user id and returns its url", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/abc" });

    const response = await POST();
    expect((await response.json()).url).toBe("https://checkout.stripe.com/abc");

    const args = mockSessionCreate.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.client_reference_id).toBe("user-1");
    expect(args.customer_email).toBe("user@example.com");
    expect(args.line_items).toEqual([{ price: "price_123", quantity: 1 }]);
    expect(args.success_url).toBe("https://app.test/?paid=1");
    expect(args.cancel_url).toBe("https://app.test/");
  });

  it("returns 500 when Stripe is not configured", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1", email: "u@e.com" });
    delete process.env.STRIPE_PRICE_ID;
    const response = await POST();
    expect(response.status).toBe(500);
  });
});
