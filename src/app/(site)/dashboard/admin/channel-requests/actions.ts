"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function channelRequestsError(message: string): never {
  redirect(`/dashboard/admin/channel-requests?error=${encodeURIComponent(message)}`);
}

// Approving creates the channel itself (as a general channel, not tied to a
// specialism lookup value - the admin can add a matching specialism-based
// channel separately if the request maps to one) and messages the requester
// to let them know, same pattern as reviewInsuranceRequest.
export async function reviewChannelRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") || "");
  if (decision !== "approved" && decision !== "rejected") channelRequestsError("Invalid decision");

  const { data: reqRow, error: fetchError } = await supabase
    .from("channel_requests")
    .select("id, requested_by, channel_name, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) channelRequestsError(fetchError.message);
  if (!reqRow) channelRequestsError("Request not found");
  if (reqRow.status !== "pending") channelRequestsError("Already reviewed");

  const { error: updateError } = await supabase
    .from("channel_requests")
    .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) channelRequestsError(updateError.message);

  let notice = `Your request for a "${reqRow.channel_name}" Town Hall channel was reviewed and declined.`;

  if (decision === "approved") {
    const slug = `requested-${reqRow.id}-${reqRow.channel_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    const { error: insertError } = await supabase.from("town_hall_channels").insert({
      slug,
      name: reqRow.channel_name,
      description: `Requested by a member and approved by an admin.`,
      is_general: true,
    });
    if (insertError) channelRequestsError(insertError.message);
    notice = `Your requested channel "${reqRow.channel_name}" has been created - you'll find it under Town Hall.`;
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ created_by: user.id, title: null })
    .select("id")
    .single();
  if (convError) channelRequestsError(convError.message);

  const { error: participantsError } = await supabase.from("conversation_participants").insert([
    { conversation_id: conversation.id, profile_id: user.id },
    { conversation_id: conversation.id, profile_id: reqRow.requested_by },
  ]);
  if (participantsError) channelRequestsError(participantsError.message);

  const { error: messageError } = await supabase.from("conversation_messages").insert({
    conversation_id: conversation.id,
    author_id: user.id,
    body: notice,
  });
  if (messageError) channelRequestsError(messageError.message);

  await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);

  revalidatePath("/dashboard/admin/channel-requests");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/town-hall");
}
