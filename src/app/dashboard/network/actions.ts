"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function networkError(message: string): never {
  redirect(`/dashboard/network?error=${encodeURIComponent(message)}`);
}

// Best-effort DM to the other party - reuses the same conversations/
// conversation_messages tables the "Message" button already writes to
// (system_notifications is admin-only by RLS, so it's not usable for a
// peer-to-peer notice like this). Deduplicated by an exact title +
// participant-set match, same pattern as startConversation, so repeat
// requests/reminders between the same two people land in one thread
// instead of spawning a new one every time.
export async function sendNetworkNotice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fromId: string,
  toId: string,
  title: string,
  body: string
) {
  try {
    const participantIds = [fromId, toId];
    let conversationId: number | null = null;

    const { data: myRows } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("profile_id", fromId);
    const myConversationIds = (myRows || []).map((r) => r.conversation_id);

    if (myConversationIds.length > 0) {
      const { data: titleMatches } = await supabase
        .from("conversations")
        .select("id")
        .in("id", myConversationIds)
        .eq("title", title);
      const candidateIds = (titleMatches || []).map((c) => c.id);

      if (candidateIds.length > 0) {
        const { data: allRows } = await supabase
          .from("conversation_participants")
          .select("conversation_id, profile_id")
          .in("conversation_id", candidateIds);
        const byConversation = new Map<number, Set<string>>();
        for (const row of allRows || []) {
          const set = byConversation.get(row.conversation_id) || new Set<string>();
          set.add(row.profile_id);
          byConversation.set(row.conversation_id, set);
        }
        const target = new Set(participantIds);
        const existing = Array.from(byConversation.entries()).find(
          ([, set]) => set.size === target.size && [...set].every((id) => target.has(id))
        )?.[0];
        if (existing) conversationId = existing;
      }
    }

    if (!conversationId) {
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({ created_by: fromId, title })
        .select("id")
        .single();
      if (convError || !conversation) return;
      conversationId = conversation.id;
      await supabase
        .from("conversation_participants")
        .insert(participantIds.map((profile_id) => ({ conversation_id: conversationId, profile_id })));
    }

    await supabase.from("conversation_messages").insert({
      conversation_id: conversationId,
      author_id: fromId,
      body,
      mentioned_profile_ids: [],
    });
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
  } catch {
    // Best-effort - never let a notification failure block the underlying
    // connection request/reminder action itself.
  }
}

export async function sendConnectionRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const addresseeId = String(formData.get("addressee_id") || "");
  const tier = String(formData.get("tier") || "trusted_colleague");

  // Bench is a one-sided, personal list - per Nick's spec, adding someone to
  // your Bench needs no confirmation from them (only Partner is mutual-
  // consent). So a bench add goes straight to "accepted" instead of
  // "pending", with no accept/decline step on their end - just an FYI
  // notice, not an actionable request.
  const { data: inserted, error } = await supabase
    .from("connections")
    .insert({
      requester_id: user.id,
      addressee_id: addresseeId,
      tier,
      status: tier === "bench" ? "accepted" : "pending",
      ...(tier === "bench" ? { responded_at: new Date().toISOString() } : {}),
    })
    .select("id")
    .single();
  // 23505 = Postgres unique-violation - a request between these two people
  // already exists (in either direction, per the table's unique constraint).
  // Treat re-clicking "Connect"/"Add to Bench" as a harmless no-op instead
  // of a hard error.
  if (error && error.code !== "23505") networkError(error.message);

  if (inserted) {
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    if (tier === "bench") {
      await sendNetworkNotice(
        supabase,
        user.id,
        addresseeId,
        "Added to a Bench",
        `${me?.full_name || "A colleague"} added you to their Bench on PsyAlliance - a looser "known" tier they may loop you in on. No action needed from you.`
      );
    } else {
      await sendNetworkNotice(
        supabase,
        user.id,
        addresseeId,
        "Connection request",
        `${me?.full_name || "A colleague"} would like to connect with you as a Trusted Colleague on PsyAlliance. Visit your Network page to accept or decline.`
      );
    }
  }

  revalidatePath("/dashboard/network");
  revalidatePath("/dashboard/people/[id]", "page");
}

// Lazy reminder check - there's no cron/background worker in this app, so
// this runs inline whenever the Network page loads (same pattern as Town
// Hall's auto-join-on-visit). Any of the caller's own outgoing pending
// requests older than ~2 weeks with no reminder sent yet gets one, stamped
// so it only ever fires once per request.
const REMINDER_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export async function sendDueConnectionReminders(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const cutoff = new Date(Date.now() - REMINDER_AFTER_MS).toISOString();
  const { data: due } = await supabase
    .from("connections")
    .select("id, addressee_id, tier, created_at")
    .eq("requester_id", userId)
    .eq("status", "pending")
    .is("reminder_sent_at", null)
    .lt("created_at", cutoff);

  if (!due || due.length === 0) return;

  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", userId).single();

  for (const c of due) {
    await sendNetworkNotice(
      supabase,
      userId,
      c.addressee_id,
      "Connection request",
      `Just a reminder - ${me?.full_name || "a colleague"} sent you a ${c.tier === "partner" || c.tier === "trusted_colleague" ? "Trusted Colleague" : "Bench"} connection request on PsyAlliance a couple of weeks ago. Visit your Network page to respond whenever you get a chance.`
    );
    await supabase.from("connections").update({ reminder_sent_at: new Date().toISOString() }).eq("id", c.id);
  }
}

export async function respondToConnection(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") || "accepted");

  const { error } = await supabase
    .from("connections")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) networkError(error.message);

  revalidatePath("/dashboard/network");
  revalidatePath("/dashboard/people/[id]", "page");
}

export async function removeConnection(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase.from("connections").delete().eq("id", id);
  if (error) networkError(error.message);

  revalidatePath("/dashboard/network");
  revalidatePath("/dashboard/people/[id]", "page");
}
