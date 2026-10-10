"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { raiseNotification } from "@/lib/notifications-v2";
import { redirect } from "next/navigation";
import { addTrusted, removeTrusted } from "@/lib/trusted";
import { safeBack, backWith } from "@/lib/back";

// Trusted colleagues are chosen, not requested (migration 0107). One button
// everywhere: "Add as Trusted Colleague". The colleague is told once and
// can add you back; nobody has to accept anything.

function refresh() {
  revalidatePath("/dashboard/network");
  revalidatePath("/dashboard/clinicians");
  revalidatePath("/dashboard/people/[id]", "page");
  revalidatePath("/dashboard");
}

export async function addTrustedAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const colleagueId = String(formData.get("colleague_id") || "");
  const back = safeBack(formData.get("back"));

  const { error, added } = await addTrusted(supabase, user.id, colleagueId);
  if (error) redirect(backWith(back || "/dashboard/network", { error }));

  if (added) {
    // Told once, with a way to add them back.
    await raiseNotification(supabase, {
      eventType: "trusted_invitation_sent",
      actorProfileId: user.id,
      actorType: "member_web",
      recipientProfileIds: [colleagueId],
      summary: "added you as a trusted colleague",
      deepLink: `/dashboard/people/${user.id}`,
    });
  }
  refresh();
  if (back) redirect(backWith(back, { trusted: "1" }));
}

export async function removeTrustedAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const colleagueId = String(formData.get("colleague_id") || "");
  const back = safeBack(formData.get("back"));

  const { error } = await removeTrusted(supabase, user.id, colleagueId);
  if (error) redirect(backWith(back || "/dashboard/network", { error }));
  refresh();
  if (back) redirect(backWith(back, { untrusted: "1" }));
}
