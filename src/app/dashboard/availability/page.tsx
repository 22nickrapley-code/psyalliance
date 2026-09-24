import { createClient } from "@/lib/supabase/server";
import { AvailabilityView } from "./view";

export default async function AvailabilityPage(props: { searchParams: Promise<{ confirmed?: string; reconfirmed?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: p } = await supabase
    .from("profiles")
    .select("referral_availability, coverage_availability, consultation_availability, availability_confirmed_at, approx_spaces, availability_paused_until")
    .eq("id", user!.id)
    .maybeSingle();
  return <AvailabilityView p={p} sp={sp} />;
}
