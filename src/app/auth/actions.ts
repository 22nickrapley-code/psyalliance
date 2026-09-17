"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

// Best-effort origin for building email redirect links. Prefers an explicit
// env var (set this once the Cloudflare/GitHub domain is live) and falls
// back to the request's own host so local/dev/preview environments work
// without any extra configuration.
function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocol = h.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

export async function signUp(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "");

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
    },
  });

  if (error) {
    redirect(`/auth/sign-up?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/auth/sign-in?message=" + encodeURIComponent("Check your email to confirm your account, then sign in."));
}

export async function signIn(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in");
}

export async function requestPasswordReset(formData: FormData) {
  const supabase = createClient();
  const email = String(formData.get("email") || "");

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
  });

  // Always show the same message whether or not the email exists, so this
  // can't be used to enumerate registered accounts.
  redirect(
    "/auth/forgot-password?message=" +
      encodeURIComponent("If that email has an account, a reset link is on its way. Check your inbox.")
  );
}

export async function resetPassword(formData: FormData) {
  const supabase = createClient();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password.length < 8) {
    redirect(`/auth/reset-password?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/auth/reset-password?error=${encodeURIComponent("Passwords don't match.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/auth/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/auth/sign-in?message=" + encodeURIComponent("Password updated. Please sign in."));
}
