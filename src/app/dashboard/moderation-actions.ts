"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fileReport, type ReportTargetType } from "@/lib/moderation";

// Shared "Report" action reused wherever a member can flag something
// (People profile, Consult, ...) rather than a per-page copy. Redirects
// back to wherever the report was filed from - "return_to" is a hidden
// field every caller sets to its own current path.
export async function fileReportAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const targetType = String(formData.get("target_type") || "") as ReportTargetType;
  const targetId = String(formData.get("target_id") || "");
  const reason = String(formData.get("reason") || "");
  const returnTo = String(formData.get("return_to") || "/dashboard");

  const { error } = await fileReport(supabase, user.id, { targetType, targetId, reason });
  if (error) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`);

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}reported=1`);
}
