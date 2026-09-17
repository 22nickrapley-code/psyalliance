import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Handles Supabase's PKCE redirect for both "confirm your email" links and
// "reset your password" links - both send the browser here with a `code`
// query param that must be exchanged for a session before anything else on
// the site (including the reset-password form) can see the user as signed
// in. `next` lets the caller choose where to land afterwards.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/auth/sign-in?error=${encodeURIComponent("That link has expired or already been used. Please try again.")}`
    );
  }

  return NextResponse.redirect(`${origin}/auth/sign-in`);
}
