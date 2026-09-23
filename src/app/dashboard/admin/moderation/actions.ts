"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { resolveReport } from "@/lib/moderation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function moderationError(message: string): never {
  redirect(`/dashboard/admin/moderation?error=${encodeURIComponent(message)}`);
}

export async function resolveReportAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const reportId = Number(formData.get("report_id"));
  const action = String(formData.get("action") || "") as
    | "dismissed"
    | "hidden"
    | "warned"
    | "restricted"
    | "suspended"
    | "escalated";
  const adminNotes = String(formData.get("admin_notes") || "") || undefined;
  const accountStatusProfileId = String(formData.get("account_status_profile_id") || "") || undefined;

  const { error } = await resolveReport(supabase, user.id, reportId, { action, adminNotes, accountStatusProfileId });
  if (error) moderationError(error);

  revalidatePath("/dashboard/admin/moderation");
  revalidatePath("/dashboard/admin/members");
  redirect("/dashboard/admin/moderation");
}
