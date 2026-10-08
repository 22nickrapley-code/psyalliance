"use server";

import { IS_DEMO_SITE, JOIN_URL } from "@/lib/env";
import { US_STATES } from "@/lib/us-states";

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

const DEGREES = new Set(["PhD", "PsyD", "EdD", "MD", "DO"]);

// One door in: anyone can create an account. A person then checks the
// license, and the network opens state by state (open_states, 0102). An
// invitation link, if someone has one, still works and is redeemed.
export async function signUp(formData: FormData) {
  if (IS_DEMO_SITE) redirect(JOIN_URL);
  const supabase = await createClient();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim().slice(0, 120);
  const qualification = String(formData.get("qualification") || "");
  const invite = String(formData.get("invite") || "").trim();
  const connect = String(formData.get("connect") || "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
  const source = String(formData.get("source") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 60);
  const valid = new Set(US_STATES.map((s) => s.code));
  const states = Array.from(new Set(formData.getAll("state").map((v) => String(v).toUpperCase()).filter((c) => valid.has(c))));
  const keep = `${invite ? `&invite=${encodeURIComponent(invite)}` : ""}${connect ? `&connect=${connect}` : ""}${source ? `&from=${source}` : ""}`;
  const back = (msg: string) => redirect(`/auth/sign-up?error=${encodeURIComponent(msg)}${keep}`);

  if (qualification === "other") redirect(`/auth/sign-up?ineligible=1${keep}`);
  if (fullName.length < 2) back("Add your full name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back("Add a valid email address.");
  if (password.length < 8) back("Choose a password of at least 8 characters.");
  if (!DEGREES.has(qualification)) back("Choose your doctoral degree.");
  if (states.length === 0) back("Choose at least one state where you're licensed.");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, qualification, states, source: source || null, invite: invite || null, connect: connect || null },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent("/dashboard/profile")}`,
    },
  });

  if (error) {
    back(
      /database error/i.test(error.message)
        ? "We couldn't create your account just now. Please try again in a little while, or write to hello@psyalliance.org."
        : /registered|exists/i.test(error.message)
          ? "There's already an account with that email. Sign in instead."
          : error.message
    );
  }
  // With email confirmation on, there's no session until they click the link.
  if (data?.session) redirect("/dashboard/profile");
  redirect("/auth/sign-in?message=" + encodeURIComponent(`Check ${email} for a link to confirm your account, then sign in.`));
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  // Where to go after signing in: only our own pages (an invitation link or the workspace).
  const nextRaw = String(formData.get("next") || "");
  const next = /^\/(i\/[a-f0-9]{8,64}|dashboard(\/[\w\-/?=&%.]*)?)$/i.test(nextRaw) ? nextRaw : "/dashboard";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth/sign-in?error=${encodeURIComponent(error.message)}${next !== "/dashboard" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  redirect(next);
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
