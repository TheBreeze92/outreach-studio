import { getUser } from "../../../../lib/supabaseServer.js";
import { getAdminClient } from "../../../../lib/supabaseAdmin.js";
import { setReplied } from "../../../../lib/generations.js";
import { reportError } from "../../../../lib/reportError.js";

export async function POST(req) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const { generation_id, replied } = await req.json();
  if (!generation_id || typeof replied !== "boolean") {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const admin = getAdminClient();
    await setReplied(admin, { id: generation_id, userId: user.id, replied });
    return Response.json({ ok: true });
  } catch (e) {
    await reportError("generations-reply", e);
    return Response.json({ error: "Could not save your feedback." }, { status: 500 });
  }
}
