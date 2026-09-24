"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Structured physician-referral notices still live in Messages.
function messagesError(message: string): never {
  redirect(`/dashboard/messages?error=${encodeURIComponent(message)}`);
}

// Responding to a structured referral sent in from the GP/physician portal -
// a separate, one-way inbox from the peer-to-peer requests above. RLS
// (provider_referrals' "target_profile_id = auth.uid()" update policy)
// is what actually stops anyone but the addressed specialist from touching
// these rows; this is just the two actions that update status.
export async function acknowledgeProviderReferral(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const { error } = await supabase
    .from("provider_referrals")
    .update({ status: "acknowledged", responded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) messagesError(error.message);

  revalidatePath("/dashboard/messages");
}

export async function declineProviderReferral(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const { error } = await supabase
    .from("provider_referrals")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) messagesError(error.message);

  revalidatePath("/dashboard/messages");
}
