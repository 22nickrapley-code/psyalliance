"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// The four yes/no practice-preference flags surfaced as one-click toggles on
// the Overview dashboard (per Nick's Excel mockup) - a small, deliberate
// whitelist rather than accepting an arbitrary column name from the form, so
// this can never be used to flip something like verification_status.
const TOGGLEABLE_FLAGS = new Set([
  "accepting_referrals",
  "open_to_receive_supervision",
  "open_to_give_supervision",
  "open_to_group_consultation",
]);

export async function setProfileFlag(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const flag = String(formData.get("flag") || "");
  if (!TOGGLEABLE_FLAGS.has(flag)) throw new Error("Unknown profile flag");
  const value = formData.get("value") === "true";

  const { error } = await supabase.from("profiles").update({ [flag]: value }).eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
}
