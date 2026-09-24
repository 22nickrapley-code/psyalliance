"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createConsultation, respondToConsultation, resolveConsultation, setResponseUseful, type ConsultationType } from "@/lib/consult";

function consultError(message: string): never {
  redirect(`/dashboard/consult?error=${encodeURIComponent(message)}`);
}

export async function createConsultationAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const question = String(formData.get("question") || "").trim();
  if (!question) consultError("What do you need help thinking through?");
  const consultationType = (String(formData.get("consultation_type") || "") || undefined) as ConsultationType | undefined;
  // Sept 23 audit (task #125): default narrowed from wider_network to
  // trusted, both here and in the form's own defaultValue - going wider is
  // now something the poster has to actively choose.
  const audienceType = String(formData.get("audience_type") || "trusted") as "trusted" | "selected" | "wider_network";
  if (!["trusted", "selected", "wider_network"].includes(audienceType)) consultError("Choose a valid audience");
  const candidateIds = [...new Set(formData.getAll("audience_profile_ids").map(String))].filter((id) => id !== user.id);
  let audienceProfileIds: string[] = [];
  if (audienceType === "selected") {
    if (!candidateIds.length || candidateIds.length > 25) consultError("Choose between one and 25 verified clinicians");
    const { data: candidateRows, error: candidateError } = await supabase.from("public_directory")
      .select("id").in("id", candidateIds);
    const eligible = new Set((candidateRows || []).map((row) => row.id));
    if (candidateError || candidateIds.some((id) => !eligible.has(id))) consultError("One of the selected clinicians is no longer verified or available");
    audienceProfileIds = candidateIds;
  }
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  // Sept 23 audit (task #125): a real confirmation gate, not just the
  // checkbox's HTML `required` attribute - a hand-crafted request can't
  // route around it.
  const deidentificationConfirmed = formData.get("deidentification_confirmed") === "on";
  if (!deidentificationConfirmed) consultError("Confirm this question is de-identified before posting.");

  const { error } = await createConsultation(supabase, user.id, {
    question,
    consultationType,
    audienceType,
    audienceProfileIds,
    tags,
    context: String(formData.get("context") || "") || undefined,
    deidentificationConfirmed,
  });
  if (error) consultError(error);

  revalidatePath("/dashboard/consult");
  redirect("/dashboard/consult");
}

export async function respondToConsultationAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const consultationId = Number(formData.get("consultation_id"));
  const body = String(formData.get("body") || "").trim();
  if (!body) consultError("Write a reply first");
  const responseType = String(formData.get("response_type") || "reply") as "reply" | "clarifying_question";

  const { error } = await respondToConsultation(supabase, user.id, consultationId, body, responseType);
  if (error) consultError(error);

  revalidatePath("/dashboard/consult");
  redirect("/dashboard/consult");
}

export async function resolveConsultationAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const consultationId = Number(formData.get("consultation_id"));
  const { error } = await resolveConsultation(supabase, user.id, consultationId);
  if (error) consultError(error);

  revalidatePath("/dashboard/consult");
  redirect("/dashboard/consult");
}

export async function setResponseUsefulAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const responseId = Number(formData.get("response_id"));
  const useful = String(formData.get("useful") || "true") === "true";
  const { error } = await setResponseUseful(supabase, user.id, responseId, useful);
  if (error) consultError(error);

  revalidatePath("/dashboard/consult");
  redirect("/dashboard/consult");
}
