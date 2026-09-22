"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function referralsError(message: string): never {
  redirect(`/dashboard/referrals?error=${encodeURIComponent(message)}`);
}

export async function createReferralRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const specialismId = formData.get("specialism_lookup_id");

  const { error } = await supabase.from("referral_requests").insert({
    requesting_profile_id: user.id,
    specialism_lookup_id: specialismId ? Number(specialismId) : null,
    state: String(formData.get("state") || "") || null,
    city: String(formData.get("city") || "") || null,
    insurance: String(formData.get("insurance") || "") || null,
    notes: String(formData.get("notes") || "") || null,
  });
  if (error) referralsError(error.message);

  revalidatePath("/dashboard/referrals");
}

export async function offerToHelp(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const referralRequestId = Number(formData.get("referral_request_id"));

  const { error } = await supabase.from("referral_responses").insert({
    referral_request_id: referralRequestId,
    responding_profile_id: user.id,
    message: String(formData.get("message") || "") || null,
  });
  if (error) referralsError(error.message);

  revalidatePath("/dashboard/referrals");
}

export async function acceptResponse(formData: FormData) {
  const supabase = await createClient();
  const responseId = Number(formData.get("response_id"));
  const requestId = Number(formData.get("referral_request_id"));

  const { error: acceptError } = await supabase
    .from("referral_responses")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", responseId);
  if (acceptError) referralsError(acceptError.message);

  await supabase
    .from("referral_responses")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("referral_request_id", requestId)
    .neq("id", responseId);

  const { error: matchError } = await supabase
    .from("referral_requests")
    .update({ status: "matched" })
    .eq("id", requestId);
  if (matchError) referralsError(matchError.message);

  revalidatePath("/dashboard/referrals");
}

export async function closeReferralRequest(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase
    .from("referral_requests")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) referralsError(error.message);

  revalidatePath("/dashboard/referrals");
}

// Responding to a structured referral sent in from the GP/physician portal -
// a separate, one-way inbox from the peer-to-peer requests above. RLS
// (provider_referrals' "target_profile_id = auth.uid()" update policy)
// is what actually stops anyone but the addressed specialist from touching
// these rows; this is just the two actions that update status.
export async function acknowledgeProviderReferral(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const note = String(formData.get("status_note") || "").trim() || null;

  const { error } = await supabase
    .from("provider_referrals")
    .update({ status: "acknowledged", status_note: note, responded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) referralsError(error.message);

  revalidatePath("/dashboard/referrals");
}

export async function declineProviderReferral(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const note = String(formData.get("status_note") || "").trim() || null;

  const { error } = await supabase
    .from("provider_referrals")
    .update({ status: "declined", status_note: note, responded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) referralsError(error.message);

  revalidatePath("/dashboard/referrals");
}
