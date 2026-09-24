"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

// Best-effort origin for building email redirect links. Prefers an explicit
// env var (set this once the Cloudflare/GitHub domain is live) and falls
// back to the request's own host so local/dev/preview environments work
// without any extra configuration.
async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocol = h.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

// Invitation-only while the founding cohort forms. The database refuses
// any new account without a valid invitation (enforce_invitation, migration
// 0085); checking first here just turns that into a clear message.
export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const invite = String(formData.get("invite") || "").trim();
  const back = (msg: string) => redirect(`/auth/sign-up?invite=${encodeURIComponent(invite)}&error=${encodeURIComponent(msg)}`);

  const { data: inv } = await supabase.rpc("invitation_status", { p_token: invite }).maybeSingle<any>();
  if (!inv?.valid) back("This invitation link has expired or has already been used. Ask us for a new one at hello@psyalliance.org.");
  if (inv.email && inv.email.toLowerCase() !== email.toLowerCase()) back(`This invitation is for ${inv.email}. Sign up with that address.`);

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, invite },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
    },
  });

  if (error) back(error.message.includes("Database error") ? "We couldn't create your account with this invitation. Ask us for a new one at hello@psyalliance.org." : error.message);

  redirect("/auth/sign-in?message=" + encodeURIComponent("Check your email to confirm your account, then sign in."));
}

// Public: ask for an invitation (anon RPC request_to_join).
export async function requestToJoinAction(formData: FormData) {
  const supabase = await createClient();
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const qualification = String(formData.get("qualification") || "");
  const states = String(formData.get("states") || "").trim().slice(0, 120);
  const note = String(formData.get("note") || "").trim().slice(0, 600);
  if (fullName.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/join?error=${encodeURIComponent("Add your name and a valid email address.")}`);
  }
  const { error } = await supabase.rpc("request_to_join", { p_full_name: fullName, p_email: email, p_qualification: qualification, p_states: states, p_note: note });
  if (error) redirect(`/join?error=${encodeURIComponent(error.message)}`);
  redirect("/join?sent=1");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in");
}

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "");

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
  });

  // Always show the same message whether or not the email exists, so this
  // can't be used to enumerate registered accounts.
  redirect(
    "/auth/forgot-password?message=" +
      encodeURIComponent("If that email has an account, a reset link is on its way. Check your inbox.")
  );
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();
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
