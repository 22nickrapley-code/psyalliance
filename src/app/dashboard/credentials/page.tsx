import { createClient } from "@/lib/supabase/server";
import { CredentialsView } from "./view";

export default async function CredentialsPage(props: { searchParams: Promise<{ saved?: string; added?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: profile }, { data: licences }, { data: ce }, { data: panels }, { data: npiChecks }] = await Promise.all([
    supabase
      .from("profiles")
      .select("verification_status, verified_at, account_status, qualification_level, npi_number, caqh_provider_id, caqh_last_attested_date, malpractice_carrier, malpractice_expires")
      .eq("id", myself)
      .maybeSingle(),
    supabase.from("licenses").select("*").eq("profile_id", myself).order("state"),
    supabase.from("continuing_education_credits").select("*").eq("profile_id", myself).order("completed_date", { ascending: false }),
    supabase.from("insurance_panels").select("*").eq("profile_id", myself).order("insurance_name"),
    supabase
      .from("credential_verifications")
      .select("matched, flagged_reason, created_at")
      .eq("profile_id", myself)
      .eq("source", "npi_registry")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  return <CredentialsView sp={sp} profile={profile} licences={licences} ce={ce} panels={panels} npiChecks={npiChecks} />;
}
