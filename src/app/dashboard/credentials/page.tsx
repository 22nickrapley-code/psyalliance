import { createClient } from "@/lib/supabase/server";
import { CredentialsView } from "./view";
import { safeBack } from "@/lib/back";
import { PageHead } from "../_components/ui";

export const metadata = { title: "Credentials" };

export default async function CredentialsPage(props: { searchParams: Promise<{ saved?: string; added?: string; error?: string; back?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: profile }, { data: licenses }, { data: ce }, { data: panels }, { data: npiChecks }] = await Promise.all([
    supabase
      .rpc("my_profile")
      .select("verification_status, verified_at, account_status, qualification_level, npi_number, caqh_provider_id, caqh_last_attested_date, malpractice_carrier, malpractice_expires, account_kind")
      .maybeSingle<any>(),
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

  if (profile?.account_kind === "operator") {
    return (
      <>
        <PageHead eyebrow="Credentials" title="Not needed for admin accounts." lead="Admin-only accounts hold no licenses and are never verified as clinicians." />
      </>
    );
  }
  return <CredentialsView sp={sp} profile={profile} licenses={licenses} ce={ce} panels={panels} npiChecks={npiChecks} back={safeBack(sp.back)} />;
}
