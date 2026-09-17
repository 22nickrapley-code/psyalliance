"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createReferralRequest(formData: FormData) {
  const supabase = createClient();
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
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/referrals");
}

export async function offerToHelp(formData: FormData) {
  const supabase = createClient();
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
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/referrals");
}

export async function acceptResponse(formData: FormData) {
  const supabase = createClient();
  const responseId = Number(formData.get("response_id"));
  const requestId = Number(formData.get("referral_request_id"));

  const { error: acceptError } = await supabase
    .from("referral_responses")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", responseId);
  if (acceptError) throw new Error(acceptError.message);

  await supabase
    .from("referral_responses")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("referral_request_id", requestId)
    .neq("id", responseId);

  const { error: matchError } = await supabase
    .from("referral_requests")
    .update({ status: "matched" })
    .eq("id", requestId);
  if (matchError) throw new Error(matchError.message);

  revalidatePath("/dashboard/referrals");
}

export async function closeReferralRequest(formData: FormData) {
  const supabase = createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase
    .from("referral_requests")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/referrals");
}
