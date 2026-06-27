import { getUser } from "../../../lib/supabaseServer.js";
import { getAdminClient } from "../../../lib/supabaseAdmin.js";
import { getBalance } from "../../../lib/credits.js";

export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const admin = getAdminClient();
  const balance = await getBalance(admin, user.id);
  return Response.json(balance);
}
