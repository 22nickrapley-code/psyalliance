"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocol = h.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

function referError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// A separate signup from the member signUp() in ../auth/actions.ts - same
// underlying Supabase Auth, but this account never gets a `profiles` row,
// only a `referring_providers` one (created next, at onboarding once
// they're signed in), which is what keeps a physician out of Network/
// Messages/Town Hall/Caseload entirely: those all key off `profiles`.
export async function signUpProvider(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "");

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role: "referring_provider" },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent("/refer/onboarding")}`,
    },
  });

  if (error) referError("/auth/refer-sign-up", error.message);

  redirect("/auth/refer-sign-in?message=" + encodeURIComponent("Check your email to confirm your account, then sign in."));
}

export async function signInProvider(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) referError("/auth/refer-sign-in", error.message);

  redirect("/refer");
}

// One-time registration form, filled the first time a confirmed provider
// signs in - goes straight to 'pending' for admin review (mirrors
// credential verification's reviewed-signup pattern for members).
export async function completeProviderOnboarding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const fullName = String(formData.get("full_name") || "").trim();
  const practiceName = String(formData.get("practice_name") || "").trim() || null;
  const npiNumber = String(formData.get("npi_number") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || user.email || "").trim();
  if (!fullName) referError("/refer/onboarding", "Enter your full name.");
  if (!email) referError("/refer/onboarding", "Enter an email address.");

  const { error } = await supabase.from("referring_providers").insert({
    id: user.id,
    full_name: fullName,
    practice_name: practiceName,
    npi_number: npiNumber,
    phone,
    email,
  });
  if (error) referError("/refer/onboarding", error.message);

  redirect("/refer/pending");
}

// Office-only availability inquiry. Patient information stays in the
// sender's established secure handoff channel.
export async function submitReferral(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const targetProfileId = String(formData.get("target_profile_id") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!["Assessment inquiry", "Therapy inquiry", "Medication consultation inquiry", "Other professional inquiry"].includes(reason)) {
    referError("/refer", "Choose a professional inquiry type.");
  }
  const { data: provider } = await supabase.from("referring_providers")
    .select("email, approval_status").eq("id", user.id).maybeSingle();
  if (!provider?.email || provider.approval_status !== "approved") referError("/refer", "Your office account must be approved first.");

  const { error } = await supabase.from("provider_referrals").insert({
    referring_provider_id: user.id,
    target_profile_id: targetProfileId,
    patient_initials: null,
    patient_age_range: null,
    reason,
    urgency: String(formData.get("urgency") || "routine"),
    contact_details: provider.email,
  });
  if (error) referError("/refer", error.message);

  redirect("/refer/referrals?sent=1");
}
