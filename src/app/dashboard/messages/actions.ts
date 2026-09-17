"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Finds "@Full Name" occurrences in a message body against the other
// participants in the conversation, and returns the set of profile ids
// mentioned - answers Nick's own open question in the spec notes ("How hard
// is it to '@' people?"). Deliberately simple (substring match against known
// participant names) rather than a rich-text editor with live autocomplete.
function findMentions(body: string, candidates: { id: string; full_name: string }[]): string[] {
  const lowerBody = body.toLowerCase();
  const mentioned = new Set<string>();
  for (const c of candidates) {
    if (!c.full_name) continue;
    if (lowerBody.includes(`@${c.full_name.toLowerCase()}`)) {
      mentioned.add(c.id);
    }
  }
  return Array.from(mentioned);
}

export async function startConversation(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const participantIds = formData.getAll("participant_ids").map((v) => String(v)).filter(Boolean);
  const title = String(formData.get("title") || "").trim() || null;
  const body = String(formData.get("body") || "").trim();

  if (participantIds.length === 0) {
    throw new Error("Choose at least one colleague to message");
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ created_by: user.id, title })
    .select("id")
    .single();
  if (convError) throw new Error(convError.message);

  const allParticipantIds = Array.from(new Set([user.id, ...participantIds]));
  const { error: participantsError } = await supabase
    .from("conversation_participants")
    .insert(allParticipantIds.map((profile_id) => ({ conversation_id: conversation.id, profile_id })));
  if (participantsError) throw new Error(participantsError.message);

  if (body) {
    const { data: others } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", participantIds);
    const mentioned = findMentions(body, others || []);

    const { error: messageError } = await supabase.from("conversation_messages").insert({
      conversation_id: conversation.id,
      author_id: user.id,
      body,
      mentioned_profile_ids: mentioned,
    });
    if (messageError) throw new Error(messageError.message);

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);
  }

  revalidatePath("/dashboard/messages");
  redirect(`/dashboard/messages/${conversation.id}`);
}

export async function sendMessage(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const conversationId = Number(formData.get("conversation_id"));
  const body = String(formData.get("body") || "").trim();
  if (!body) return;

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("profile_id, profile:profile_id(id, full_name)")
    .eq("conversation_id", conversationId);
  const others = (participants || [])
    .map((p: any) => p.profile)
    .filter((p: any) => p && p.id !== user.id);
  const mentioned = findMentions(body, others);

  const { error } = await supabase.from("conversation_messages").insert({
    conversation_id: conversationId,
    author_id: user.id,
    body,
    mentioned_profile_ids: mentioned,
  });
  if (error) throw new Error(error.message);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", user.id);

  revalidatePath(`/dashboard/messages/${conversationId}`);
  revalidatePath("/dashboard/messages");
}

export async function markConversationRead(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const conversationId = Number(formData.get("conversation_id"));

  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", user.id);

  revalidatePath("/dashboard/messages");
}
