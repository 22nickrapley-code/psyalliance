"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to the
// relevant page (the inbox, or the specific thread) with an inline banner
// rather than taking the page down.
function messagesError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

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

// Shared by both the fresh-conversation path and the dedup-reuse path below
// - posts the optional opening message and bumps last_message_at.
async function postInitialMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: number,
  authorId: string,
  body: string,
  otherParticipantIds: string[]
) {
  const { data: others } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", otherParticipantIds);
  const mentioned = findMentions(body, others || []);

  const { error: messageError } = await supabase.from("conversation_messages").insert({
    conversation_id: conversationId,
    author_id: authorId,
    body,
    mentioned_profile_ids: mentioned,
  });
  if (messageError) messagesError("/dashboard/messages", messageError.message);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export async function startConversation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const participantIds = formData.getAll("participant_ids").map((v) => String(v)).filter(Boolean);
  const title = String(formData.get("title") || "").trim() || null;
  const body = String(formData.get("body") || "").trim();

  // A plain `throw` here used to take down the whole page with the generic
  // "Something went wrong / Server Components render" crash screen, because
  // an uncaught error thrown inside a server action bubbles up to the
  // nearest error boundary instead of being shown inline. redirect()-with-a-
  // query-param is the same pattern already used elsewhere in this app
  // (see requestNewInsurance's ?insurance_requested=1) - it fails gracefully
  // back to this same page with a friendly banner instead of crashing it.
  if (participantIds.length === 0) {
    redirect(`/dashboard/messages?error=${encodeURIComponent("Choose at least one colleague to message before sending.")}`);
  }

  const allParticipantIds = Array.from(new Set([user.id, ...participantIds]));

  // Deduplicated by an exact (title, participant-set) match - re-triggering
  // the same targeted outreach reuses the existing thread instead of
  // spawning a fresh duplicate every time. This covers both the untitled
  // "Start new conversation" flow AND fixed-title one-click outreach like
  // Supervision's "Request supervision"/"Offer supervision" buttons, which
  // pass the same title on every click and would otherwise create a new
  // duplicate thread to the same person each time they're clicked. A
  // *different* title with the same people (e.g. "Partner group
  // consultation" run again after the partner list changed, or a
  // genuinely new titled thread) is treated as new, since the title text
  // itself differentiates it.
  {
    const { data: myParticipantRows } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("profile_id", user.id);
    const myConversationIds = (myParticipantRows || []).map((r) => r.conversation_id);

    if (myConversationIds.length > 0) {
      let titleMatchQuery = supabase.from("conversations").select("id").in("id", myConversationIds);
      titleMatchQuery = title ? titleMatchQuery.eq("title", title) : titleMatchQuery.is("title", null);
      const { data: titleMatchingConversations } = await titleMatchQuery;
      const candidateIds = (titleMatchingConversations || []).map((c) => c.id);

      if (candidateIds.length > 0) {
        const { data: allRows } = await supabase
          .from("conversation_participants")
          .select("conversation_id, profile_id")
          .in("conversation_id", candidateIds);
        const participantsByConversation = new Map<number, Set<string>>();
        for (const row of allRows || []) {
          const set = participantsByConversation.get(row.conversation_id) || new Set<string>();
          set.add(row.profile_id);
          participantsByConversation.set(row.conversation_id, set);
        }
        const targetSet = new Set(allParticipantIds);
        const existingId = Array.from(participantsByConversation.entries()).find(
          ([, set]) => set.size === targetSet.size && [...set].every((id) => targetSet.has(id))
        )?.[0];

        if (existingId) {
          if (body) {
            await postInitialMessage(supabase, existingId, user.id, body, participantIds);
          }
          revalidatePath("/dashboard/messages");
          redirect(`/dashboard/messages/${existingId}`);
        }
      }
    }
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ created_by: user.id, title })
    .select("id")
    .single();
  if (convError) messagesError("/dashboard/messages", convError.message);

  const { error: participantsError } = await supabase
    .from("conversation_participants")
    .insert(allParticipantIds.map((profile_id) => ({ conversation_id: conversation.id, profile_id })));
  if (participantsError) messagesError("/dashboard/messages", participantsError.message);

  if (body) {
    await postInitialMessage(supabase, conversation.id, user.id, body, participantIds);
  }

  revalidatePath("/dashboard/messages");
  redirect(`/dashboard/messages/${conversation.id}`);
}

export async function sendMessage(formData: FormData) {
  const supabase = await createClient();
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
  if (error) messagesError(`/dashboard/messages/${conversationId}`, error.message);

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

// Deliberately not a NULL/boolean flag on conversation_participants - reuses
// the same last_read_at column the whole unread computation already runs
// off of everywhere else (list preview, Overview widget, sidebar count,
// thread view). "Unread" is a sentinel far enough in the past that it reads
// as older than any real last_message_at; "read" is just now(). Lets a
// member manually flip a thread back to unread after opening it - familiar
// from any email client - without a schema change or touching every other
// unread check in the app.
const FORCE_UNREAD_SENTINEL = "1970-01-01T00:00:00.000Z";

export async function setConversationReadState(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const conversationId = Number(formData.get("conversation_id"));
  const state = String(formData.get("state") || "");
  if (state !== "read" && state !== "unread") messagesError("/dashboard/messages", "Invalid state");

  const { error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: state === "unread" ? FORCE_UNREAD_SENTINEL : new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", user.id);
  if (error) messagesError("/dashboard/messages", error.message);

  revalidatePath("/dashboard/messages");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/messages/${conversationId}`);

  // Only the thread view passes this - marking a thread unread while sitting
  // inside it would just get silently overwritten back to read by that
  // page's own mark-read-on-open effect, so it sends the user back to the
  // inbox instead, exactly like clicking "mark unread" in Gmail bounces you
  // out of the thread.
  const redirectTo = String(formData.get("redirect_to") || "");
  if (redirectTo) redirect(redirectTo);
}

// Mark-read/unread for the company/admin notices that now show up in the
// inbox alongside real conversations (see system_notifications). Same shape
// as setConversationReadState above, but read_at is a plain nullable
// timestamp here rather than the epoch-sentinel trick, since there's no
// existing "last read" computation on this table to stay compatible with.
export async function setNotificationReadState(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = Number(formData.get("id"));
  const state = String(formData.get("state") || "");
  if (state !== "read" && state !== "unread") messagesError("/dashboard/messages", "Invalid state");

  const { error } = await supabase
    .from("system_notifications")
    .update({ read_at: state === "unread" ? null : new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) messagesError("/dashboard/messages", error.message);

  revalidatePath("/dashboard/messages");
  revalidatePath("/dashboard");
}
