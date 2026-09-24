"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The monthly one-click availability check. The emailed token is the only
// credential: it works once and expires after 30 days
// (availability_check_apply, migration 0071).
export async function applyAvailabilityCheck(formData: FormData) {
  const token = String(formData.get("token") || "");
  const supabase = await createClient();
  const { data: ok } = await supabase.rpc("availability_check_apply", {
    p_token: token,
    p_referral: String(formData.get("referral") || ""),
    p_cover: String(formData.get("cover") || ""),
    p_consult: String(formData.get("consult") || ""),
  });
  redirect(`/availability-check/${encodeURIComponent(token)}?${ok ? "done=1" : "failed=1"}`);
}
