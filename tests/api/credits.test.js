import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockGetUser = vi.fn();
const mockGetBalance = vi.fn();

vi.mock("../../lib/supabaseServer.js", () => ({ getUser: (...a) => mockGetUser(...a) }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ getAdminClient: () => ({}) }));
vi.mock("../../lib/credits.js", () => ({ getBalance: (...a) => mockGetBalance(...a) }));

import { GET } from "../../app/api/credits/route.js";

describe("GET /api/credits", () => {
  beforeEach(() => { mockGetUser.mockReset(); mockGetBalance.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  it("returns 401 when signed out", async () => {
    mockGetUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the balance for a signed-in user", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" });
    mockGetBalance.mockResolvedValue({ free_remaining: 2, paid_credits: 50 });
    const response = await GET();
    expect(await response.json()).toEqual({ free_remaining: 2, paid_credits: 50 });
  });
});
