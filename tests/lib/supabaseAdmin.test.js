import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ marker: "admin-client" })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { getAdminClient } from "../../lib/supabaseAdmin.js";

describe("getAdminClient", () => {
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    createClient.mockClear();
  });
  afterEach(() => { process.env = saved; });

  it("creates a client with the service role key and no session persistence", () => {
    const client = getAdminClient();
    expect(client).toEqual({ marker: "admin-client" });
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-key",
      { auth: { persistSession: false } }
    );
  });

  it("throws when env is missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getAdminClient()).toThrow(/not configured/);
  });
});
