"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Open or close the network in a state. Members licensed there join (or
// leave) the network straight away; nobody's account changes.
export async function setStateOpenAction(formData: FormData) {
  const supabase = await createClient();
  const state = String(formData.get("state") || "").toUpperCase().slice(0, 2);
  const open = formData.get("open") === "1";
  const { error } = await supabase.rpc("admin_set_state_open", { p_state: state, p_open: open });
  if (error) redirect(`/dashboard/admin/states?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/admin/states");
  redirect(`/dashboard/admin/states?${open ? "opened" : "closed"}=${state}`);
}

// A state building its founding circle (v4): open to members, but referrals to the whole network wait until it's
// complete. Members keep everything they have already started.
export async function setFoundingCircleAction(formData: FormData) {
  const supabase = await createClient();
  const state = String(formData.get("circle_state") || "").toUpperCase().slice(0, 2);
  const on = formData.get("on") === "1";
  const { error } = await supabase.rpc("admin_set_founding_circle", { p_state: state, p_on: on });
  if (error) redirect(`/dashboard/admin/states?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard/admin/states");
  redirect(`/dashboard/admin/states?${on ? "circle" : "complete"}=${state}`);
}
