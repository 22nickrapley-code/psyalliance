"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Master Brief #32: "Make this a seconds-long interaction." One update,
// one confirmation timestamp - no service-layer indirection needed for
// something this small.
export async function confirmAvailability(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const referralAvailability = String(formData.get("referral_availability") || "yes");
  const coverageAvailability = String(formData.get("coverage_availability") || "ask_me");
  const consultationAvailability = String(formData.get("consultation_availability") || "yes");

  const { error } = await supabase
    .from("profiles")
    .update({
      referral_availability: referralAvailability,
      coverage_availability: coverageAvailability,
      consultation_availability: consultationAvailability,
      availability_confirmed_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) redirect(`/dashboard/availability?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/dashboard/availability");
  revalidatePath("/dashboard");
  redirect("/dashboard/availability?confirmed=1");
}
