"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createConsultation, respondToConsultation, resolveConsultation, setResponseUseful, type ConsultationType } from "@/lib/consult";
import { raiseNotification } from "@/lib/notifications-v2";
import { identifierError } from "@/lib/deidentify";

// Consult (Product Spec v1): one feature at four audience sizes. Every
// question is saved as a draft first and shown on a review screen with its
// exact audience; it's only visible to anyone once the author publishes.

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  return { supabase, userId: user.id };
}

function back(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function draftConsultAction(formData: FormData) {
  const { supabase, userId } = await me();
  const kind = (String(formData.get("kind") || "question") as "question" | "supervision_request" | "supervision_offer");
  const editing = Number(formData.get("draft_id")) || 0;
  const composePath = editing ? `/dashboard/consult/new?draft=${editing}` : `/dashboard/consult/new${kind !== "question" ? `?kind=${kind}` : ""}`;
  const question = String(formData.get("question") || "").trim();
  const context = String(formData.get("context") || "").trim() || undefined;
  if (!question) back(composePath, "Write your question in one sentence.");
  const idErr = identifierError(`${question}\n${context || ""}`);
  if (idErr) back(composePath, idErr);
  if (formData.get("deidentified") !== "on") back(composePath, "Confirm the question contains no client-identifying details.");

  const audience = String(formData.get("audience") || "trusted");
  let audienceType: "trusted" | "selected" | "wider_network" = "trusted";
  let audienceProfileIds: string[] = [];
  let groupId: number | undefined;
  if (audience === "one" || audience === "selected") {
    audienceType = "selected";
    audienceProfileIds = formData.getAll("recipients").map(String).filter(Boolean);
    if (audience === "one") audienceProfileIds = audienceProfileIds.slice(0, 1);
    if (audienceProfileIds.length === 0) back(composePath, "Choose who should see this.");
  } else if (audience.startsWith("group:")) {
    groupId = Number(audience.slice(6));
    audienceType = "selected";
  } else if (audience === "wider_network") {
    audienceType = "wider_network";
  }

  const tags = [String(formData.get("tag_area") || ""), String(formData.get("tag_topic") || "")].map((t) => t.trim()).filter(Boolean);
  // Editing a draft updates it in place.
  const draftId = Number(formData.get("draft_id")) || 0;
  if (draftId) {
    const { error: upErr } = await supabase
      .from("consultations")
      .update({
        question,
        context: context ?? null,
        consultation_type: (String(formData.get("consultation_type") || "") || null) as ConsultationType | null,
        audience_type: audienceType,
        audience_profile_ids: audienceType === "selected" ? audienceProfileIds : [],
        group_id: groupId ?? null,
        tags,
      })
      .eq("id", draftId)
      .eq("author_profile_id", userId)
      .eq("status", "draft");
    if (upErr) back(`/dashboard/consult/new?draft=${draftId}`, upErr.message);
    redirect(`/dashboard/consult/${draftId}`);
  }
  const { consultationId, error } = await createConsultation(supabase, userId, {
    question,
    context,
    consultationType: (String(formData.get("consultation_type") || "") || undefined) as ConsultationType | undefined,
    audienceType,
    audienceProfileIds,
    groupId,
    tags,
    deidentificationConfirmed: true,
    kind,
    status: "draft",
  });
  if (error || !consultationId) back(composePath, error || "Couldn't save your question.");
  redirect(`/dashboard/consult/${consultationId}`);
}

export async function publishConsultAction(formData: FormData) {
  const { supabase, userId } = await me();
  const id = Number(formData.get("consultation_id"));
  const { data: c } = await supabase.from("consultations").select("*").eq("id", id).eq("author_profile_id", userId).maybeSingle();
  if (!c) back("/dashboard/consult", "Question not found.");
  const { error } = await supabase.from("consultations").update({ status: "open" }).eq("id", id);
  if (error) back(`/dashboard/consult/${id}`, error.message);

  let recipients: string[] = [];
  if (c.group_id) {
    const { data: members } = await supabase.from("consultation_group_members").select("profile_id").eq("group_id", c.group_id).eq("status", "joined");
    recipients = (members || []).map((m: any) => m.profile_id).filter(Boolean);
  } else if (c.audience_type === "selected") {
    recipients = c.audience_profile_ids || [];
  } else if (c.audience_type === "trusted") {
    const { data: conns } = await supabase.from("trusted_colleagues").select("colleague_id").eq("profile_id", userId);
    recipients = (conns || []).map((x: any) => x.colleague_id);
  }
  if (recipients.length) {
    await raiseNotification(supabase, {
      eventType: "consultation_invite",
      recipientProfileIds: recipients,
      actorProfileId: userId,
      actorType: "member_web",
      summary: c.kind === "supervision_request" ? "is looking for supervision" : c.kind === "supervision_offer" ? "is offering supervision" : "asked you for your input",
      deepLink: `/dashboard/consult/${id}`,
      metadata: { consultationId: id },
    });
  }
  revalidatePath("/dashboard/consult");
  redirect(`/dashboard/consult/${id}?published=1`);
}

export async function discardDraftAction(formData: FormData) {
  const { supabase, userId } = await me();
  const id = Number(formData.get("consultation_id"));
  await supabase.from("consultations").delete().eq("id", id).eq("author_profile_id", userId).eq("status", "draft");
  redirect("/dashboard/consult");
}

export async function respondToConsultationAction(formData: FormData) {
  const { supabase, userId } = await me();
  const id = Number(formData.get("consultation_id"));
  const body = String(formData.get("body") || "").trim();
  if (!body) back(`/dashboard/consult/${id}`, "Write a reply first.");
  const idErr = identifierError(body);
  if (idErr) back(`/dashboard/consult/${id}`, idErr);
  const responseType = String(formData.get("response_type") || "reply") as "reply" | "clarifying_question";
  const { error } = await respondToConsultation(supabase, userId, id, body, responseType);
  if (error) back(`/dashboard/consult/${id}`, error);
  revalidatePath(`/dashboard/consult/${id}`);
  redirect(`/dashboard/consult/${id}`);
}

export async function resolveConsultationAction(formData: FormData) {
  const { supabase, userId } = await me();
  const id = Number(formData.get("consultation_id"));
  const { error } = await resolveConsultation(supabase, userId, id);
  if (error) back(`/dashboard/consult/${id}`, error);
  revalidatePath("/dashboard/consult");
  redirect(`/dashboard/consult/${id}`);
}

export async function setResponseUsefulAction(formData: FormData) {
  const { supabase, userId } = await me();
  const id = Number(formData.get("consultation_id"));
  const responseId = Number(formData.get("response_id"));
  const useful = String(formData.get("useful") || "true") === "true";
  const { error } = await setResponseUseful(supabase, userId, responseId, useful);
  if (error) back(`/dashboard/consult/${id}`, error);
  redirect(`/dashboard/consult/${id}`);
}

export async function followTagAction(formData: FormData) {
  const { supabase, userId } = await me();
  const tag = String(formData.get("tag") || "").trim();
  const follow = formData.get("follow") !== "0";
  if (tag) {
    if (follow) await supabase.from("consult_tag_follows").upsert({ profile_id: userId, tag });
    else await supabase.from("consult_tag_follows").delete().eq("profile_id", userId).eq("tag", tag);
  }
  revalidatePath("/dashboard/consult");
  redirect(`/dashboard/consult?tag=${encodeURIComponent(tag)}`);
}
