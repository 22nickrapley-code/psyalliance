"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The consultation groups switch for this site. It takes effect on members' next page load; no rebuild.
export async function setGroupsAction(formData: FormData) {
  const supabase = await createClient();
  const on = formData.get("on") === "1";
  const { error } = await supabase.rpc("admin_set_consult_groups", { p_on: on });
  if (error) redirect(`/dashboard/admin/features?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/admin/features");
  redirect(`/dashboard/admin/features?${on ? "on" : "off"}=1`);
}
