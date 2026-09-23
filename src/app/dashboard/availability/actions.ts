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

  // Every radio group is `required` on the form now (Sept 23 audit fix), so
  // a real submit always carries all three - these fallbacks only cover a
  // malformed/manual POST, never the normal path.
  const referralAvailability = String(formData.get("referral_availability") || "no");
  const coverageAvailability = String(formData.get("coverage_availability") || "no");
  const consultationAvailability = String(formData.get("consultation_availability") || "no");

  const { error } = await supabase
    .from("profiles")
    .update({
      referral_availability: referralAvailability,
      coverage_availability: coverageAvailability,
      consultation_availability: consultationAvailability,
      availability_confirmed_at: new Date().toISOString(),
      // Sept 23 audit finding: this confirmed tri-state and the legacy
      // `accepting_referrals` boolean (still read by the Profile page badge
      // and the physician-referral portal at /refer) used to be two
      // independently-editable signals that could and did disagree - that's
      // exactly the "Never confirmed" vs. pre-selected "Yes" contradiction
      // the audit caught. This is now the ONLY place `accepting_referrals`
      // gets written (the Profile edit form's old checkbox was removed) - it's
      // a derived mirror of this confirmed answer, not a second source of truth.
      accepting_referrals: referralAvailability === "yes",
    })
    .eq("id", user.id);
  if (error) redirect(`/dashboard/availability?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/dashboard/availability");
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/people/${user.id}`);
  revalidatePath("/dashboard/network");
  revalidatePath("/refer");
  redirect("/dashboard/availability?confirmed=1");
}
