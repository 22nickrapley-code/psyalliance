"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function insuranceRequestsError(message: string): never {
  redirect(`/dashboard/admin/insurance-requests?error=${encodeURIComponent(message)}`);
}

// Approving adds the value to the canonical lookup_values list (so it shows
// up in every Insurance dropdown immediately) and opens/continues a direct
// message to the requester telling them it's live - the "sends a message to
// the user" Nick asked for, reusing the existing Messages system rather
// than building a separate notifications table for one use case.
export async function reviewInsuranceRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") || "");
  if (decision !== "approved" && decision !== "rejected") insuranceRequestsError("Invalid decision");

  const { data: reqRow, error: fetchError } = await supabase
    .from("insurance_requests")
    .select("id, requested_by, requested_value, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) insuranceRequestsError(fetchError.message);
  if (!reqRow) insuranceRequestsError("Request not found");
  if (reqRow.status !== "pending") insuranceRequestsError("Already reviewed");

  const { error: updateError } = await supabase
    .from("insurance_requests")
    .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) insuranceRequestsError(updateError.message);

  if (decision === "approved") {
    // Ignore a duplicate-value race (two people requesting the same
    // provider around the same time) rather than failing the approval -
    // the dropdown ends up correct either way.
    const { data: existing } = await supabase
      .from("lookup_values")
      .select("id")
      .eq("category", "insurance")
      .eq("value", reqRow.requested_value)
      .maybeSingle();
    if (!existing) {
      const { error: insertError } = await supabase
        .from("lookup_values")
        .insert({ category: "insurance", value: reqRow.requested_value });
      if (insertError) insuranceRequestsError(insertError.message);
    }

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .insert({ created_by: user.id, title: null })
      .select("id")
      .single();
    if (convError) insuranceRequestsError(convError.message);

    const { error: participantsError } = await supabase.from("conversation_participants").insert([
      { conversation_id: conversation.id, profile_id: user.id },
      { conversation_id: conversation.id, profile_id: reqRow.requested_by },
    ]);
    if (participantsError) insuranceRequestsError(participantsError.message);

    const { error: messageError } = await supabase.from("conversation_messages").insert({
      conversation_id: conversation.id,
      author_id: user.id,
      body: `Your request to add "${reqRow.requested_value}" as an insurance option has been approved — it's now available in the Insurance dropdown on Caseload.`,
    });
    if (messageError) insuranceRequestsError(messageError.message);

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);
  }

  revalidatePath("/dashboard/admin/insurance-requests");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/caseload");
}
