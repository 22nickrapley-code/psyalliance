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
  const audienceType = String(formData.get("audience_type") || "wider_network") as "trusted" | "wider_network";
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const { error } = await createConsultation(supabase, user.id, {
    question,
    consultationType,
    audienceType,
    tags,
    context: String(formData.get("context") || "") || undefined,
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
