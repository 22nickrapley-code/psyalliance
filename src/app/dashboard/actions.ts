"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function dashboardError(message: string): never {
  redirect(`/dashboard?error=${encodeURIComponent(message)}`);
}

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
  if (!TOGGLEABLE_FLAGS.has(flag)) dashboardError("Unknown profile flag");
  const value = formData.get("value") === "true";

  const { error } = await supabase.from("profiles").update({ [flag]: value }).eq("id", user.id);
  if (error) dashboardError(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
}
