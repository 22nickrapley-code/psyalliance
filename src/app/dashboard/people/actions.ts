"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendNetworkNotice } from "../network/actions";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same profile page with an inline banner rather than taking the page down.
function profileActionError(profileId: string, message: string): never {
  redirect(`/dashboard/people/${profileId}?error=${encodeURIComponent(message)}`);
}

// Written, LinkedIn-style endorsement. One per (endorser, endorsee) pair -
// re-submitting updates the existing row via upsert rather than stacking
// duplicates, so "Edit your endorsement" and "Endorse" are the same action.
export async function submitEndorsement(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const endorseeId = String(formData.get("endorsee_id") || "");
  const body = String(formData.get("body") || "").trim();
  if (!endorseeId) throw new Error("Missing endorsee");
  if (endorseeId === user.id) profileActionError(endorseeId, "You can't endorse yourself");
  if (!body) profileActionError(endorseeId, "Write a line or two before endorsing");

  const { data: existing } = await supabase
    .from("endorsements")
    .select("id")
    .eq("endorser_id", user.id)
    .eq("endorsee_id", endorseeId)
    .maybeSingle();

  const { error } = await supabase
    .from("endorsements")
    .upsert(
      { endorser_id: user.id, endorsee_id: endorseeId, body, updated_at: new Date().toISOString() },
      { onConflict: "endorser_id,endorsee_id" }
    );
  if (error) profileActionError(endorseeId, error.message);

  if (!existing) {
    const { data: myProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    await sendNetworkNotice(
      supabase,
      user.id,
      endorseeId,
      `Endorsement from ${myProfile?.full_name || "a colleague"}`,
      `${myProfile?.full_name || "A colleague"} endorsed you: "${body}"`
    );
  }

  revalidatePath(`/dashboard/people/${endorseeId}`);
}

export async function deleteEndorsement(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const endorseeId = String(formData.get("endorsee_id") || "");

  const { error } = await supabase
    .from("endorsements")
    .delete()
    .eq("endorser_id", user.id)
    .eq("endorsee_id", endorseeId);
  if (error) profileActionError(endorseeId, error.message);

  revalidatePath(`/dashboard/people/${endorseeId}`);
}


// Legacy forms may still exist on cached clients. Reject them on the server;
// they used to send client labels into network notifications.
export async function assignColleagueToClient(_formData: FormData) {
  redirect("/dashboard/requests?error=Patient-linked+assignments+are+retired");
}

export async function markSentToPatient(_formData: FormData) {
  redirect("/dashboard/requests?error=Patient-linked+assignments+are+retired");
}
