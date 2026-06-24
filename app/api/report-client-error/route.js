import { reportError } from "../../../lib/reportError.js";

export async function POST(req) {
  try {
    const { message, stack } = await req.json();
    await reportError("client", new Error(message + (stack ? `\n${stack}` : "")));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
