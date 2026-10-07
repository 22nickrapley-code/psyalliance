"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CONTINUITY_SECTIONS } from "@/lib/continuity";

const back = (q: string) => redirect(`/dashboard/continuity${q}`);

// Saves one section of the plan. Answers merge into what's already there.
export async function saveContinuitySection(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const sectionKey = String(formData.get("section") || "");
  const { data: existing } = await supabase.from("continuity_plans").select("answers, backup_profile_id, alternate_profile_id").eq("profile_id", user.id).maybeSingle();
  const answers: Record<string, string> = { ...((existing?.answers as any) || {}) };
  const row: Record<string, unknown> = { profile_id: user.id };

  if (sectionKey === "backup") {
    const backup = String(formData.get("backup_profile_id") || "") || null;
    const alternate = String(formData.get("alternate_profile_id") || "") || null;
    if (backup && backup === alternate) back(`?error=${encodeURIComponent("Choose two different colleagues for backup and alternate.")}#backup`);
    row.backup_profile_id = backup;
    row.alternate_profile_id = alternate;
    for (const k of ["backup_outside", "alternate_outside"]) answers[k] = String(formData.get(k) || "").trim().slice(0, 300);
  } else {
    const section = CONTINUITY_SECTIONS.find((s) => s.key === sectionKey);
    if (!section) back("");
    for (const f of section!.fields) answers[f.key] = String(formData.get(f.key) || "").trim().slice(0, 2000);
  }
  row.answers = answers;

  const { error } = await supabase.from("continuity_plans").upsert(row, { onConflict: "profile_id" });
  if (error) back(`?error=${encodeURIComponent(error.message)}#${sectionKey}`);
  revalidatePath("/dashboard/continuity");
  back(`?saved=${sectionKey}#${sectionKey}`);
}

export async function markContinuityReviewed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  await supabase.from("continuity_plans").update({ reviewed_at: new Date().toISOString() }).eq("profile_id", user.id);
  revalidatePath("/dashboard/continuity");
  back("?reviewed=1");
}

// The colleague named as backup or alternate answers.
export async function respondContinuityAction(formData: FormData) {
  const supabase = await createClient();
  const owner = String(formData.get("owner") || "");
  const accept = String(formData.get("accept") || "") === "1";
  const { error } = await supabase.rpc("respond_continuity", { p_owner: owner, p_accept: accept });
  if (error) redirect(`/dashboard/continuity/duties?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/continuity/duties");
  redirect(`/dashboard/continuity/duties?${accept ? "accepted" : "declined"}=1`);
}
