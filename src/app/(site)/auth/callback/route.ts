import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Where "confirm your email" and "reset your password" links land.
//
// A fresh confirmation link has done its job by the time the browser gets
// here with a `code`; the code then signs the member in, but only in the
// browser that started sign-up (it needs a cookie from that browser). Open
// the link in another browser or the mail app and we ask them to sign in,
// without calling the link expired (Nick, 11 Oct) and without claiming the
// email is confirmed, which this page can't know (release review R10).
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
    // Opened in another browser or the mail app, a fresh link has still done
    // its job, but this page can't tell a fresh link from a stale one, so it
    // says neither. A link this browser started that fails is expired.
    const otherBrowser = /code[ _]verifier|pkce/i.test(`${(error as any).code || ""} ${error.message}`);
    if (!otherBrowser) return expired();
    return signIn({
      message: next.startsWith("/dashboard/profile")
        ? "Sign in to carry on setting up your profile. Opened the link in a different browser or app? That's fine; sign in here."
        : "Sign in to carry on. Opened the link in a different browser or app? That's fine; sign in here.",
      next,
    });
  }

  // Supabase sends errors (an expired or used link) as query parameters.
  if (searchParams.get("error_code") || searchParams.get("error")) return expired();

  return NextResponse.redirect(`${origin}/auth/sign-in`);
}
