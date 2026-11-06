"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The "AI tech enabled" switch for this site. It takes effect on members' next page load; no rebuild.
export async function setAiAction(formData: FormData) {
  const supabase = await createClient();
  const on = formData.get("on") === "1";
  const { error } = await supabase.rpc("admin_set_ai", { p_on: on });
  if (error) redirect(`/dashboard/admin/ai?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/admin/ai");
  redirect(`/dashboard/admin/ai?${on ? "on" : "off"}=1`);
}
