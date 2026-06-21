import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const { error } = await supabase
      .from('signups')
      .insert([{ email, created_at: new Date().toISOString() }]);

    if (error) throw error;

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message || "Failed to subscribe." }, { status: 500 });
  }
}