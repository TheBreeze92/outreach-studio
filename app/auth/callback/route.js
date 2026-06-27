import { NextResponse } from "next/server";
import { getServerClient } from "../../../lib/supabaseServer.js";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const base = process.env.NEXT_PUBLIC_SITE_URL || origin;

  if (code) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(error.message)}`);
    }
  }

  return NextResponse.redirect(`${base}/`);
}
