import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Where "confirm your email" and "reset your password" links land.
//
// Supabase has already confirmed the email by the time the browser gets
// here with a `code`; the code then signs the member in, but only in the
// browser that started sign-up (it needs a cookie from that browser). Open
// the link in another browser or the mail app and the email is still
// confirmed, so we say so and ask them to sign in, rather than calling the
// link expired (Nick, 11 Oct: "it says this when you click the
// verification link - but it still lets me log in").
//
// If the email template sends `token_hash` instead of the default link,
// the link signs in from any browser or device.
const only = (next: string | null, fallback: string) => (next && next.startsWith("/") && !next.startsWith("//") ? next : fallback);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = only(searchParams.get("next"), "/dashboard");
  const reset = next.startsWith("/auth/reset-password") || type === "recovery";
  const signIn = (params: Record<string, string>) => NextResponse.redirect(`${origin}/auth/sign-in?${new URLSearchParams(params).toString()}`);
  const forgot = (msg: string) => NextResponse.redirect(`${origin}/auth/forgot-password?error=${encodeURIComponent(msg)}`);
  const expired = () =>
    reset
      ? forgot("That reset link has expired or was already used. Send yourself a new one below.")
      : signIn({ error: "That confirmation link has expired or was already used. If you've already confirmed your email, just sign in.", next });

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return expired();
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    if (reset) return forgot("Open the reset link in the same browser you asked for it from, or send yourself a new one below.");
    // The email is confirmed; only the automatic sign-in didn't happen.
    return signIn({ message: next.startsWith("/dashboard/profile") ? "Your email is confirmed. Sign in to carry on setting up your profile." : "Your email is confirmed. Sign in to carry on.", next });
  }

  // Supabase sends errors (an expired or used link) as query parameters.
  if (searchParams.get("error_code") || searchParams.get("error")) return expired();

  return NextResponse.redirect(`${origin}/auth/sign-in`);
}
