import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { resolveAvatarUrls } from "@/lib/avatars";
import { professionFor } from "@/lib/profession";
import { submitReferral } from "./actions";
import ProviderDirectory, { type SpecialistEntry } from "./provider-directory";

export default async function ProviderDirectoryPage(
  props: { searchParams: Promise<{ error?: string }> }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/refer-sign-in");

  const { data: provider } = await supabase
    .from("referring_providers")
    .select("approval_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!provider) redirect("/refer/onboarding");
  if (provider.approval_status !== "approved") redirect(provider.approval_status === "rejected" ? "/refer/rejected" : "/refer/pending");

  // public_directory is already scoped to verified members only (its own
  // view definition) and readable by any authenticated user - no separate
  // RLS needed for a referring provider to browse it.
  const { data: directoryRows } = await supabase
    .from("public_directory")
    .select("*")
    .eq("accepting_referrals", true);

  const peopleById = new Map<string, SpecialistEntry>();
  const specialismSet = new Set<string>();
  for (const row of directoryRows || []) {
    if (!peopleById.has(row.id)) {
      peopleById.set(row.id, {
        id: row.id,
        name: row.full_name,
        credentialPrefix: row.credential_prefix,
        profession: professionFor(row.qualification_level),
        city: row.primary_practice_city,
        state: row.primary_state,
        specialisms: [],
        psypact: row.psypact_participating,
        avatarUrl: null,
      });
    }
    if (row.category === "treatment_specialism") {
      peopleById.get(row.id)!.specialisms.push(row.value);
      specialismSet.add(row.value);
    }
  }

  const avatarPathByRowId = new Map((directoryRows || []).map((r: any) => [r.id, r.avatar_path]));
  const avatarUrlByPath = await resolveAvatarUrls(supabase, Array.from(avatarPathByRowId.values()));
  for (const [id, person] of peopleById) {
    person.avatarUrl = avatarUrlByPath.get(avatarPathByRowId.get(id) || "") || null;
  }

  const people = Array.from(peopleById.values());
  const specialismOptions = Array.from(specialismSet).sort();

  return (
    <div>
      <h1>Find a specialist</h1>
      <p className="muted">
        A curated, read-only view of PsyAlliance's verified psychologists and psychiatrists who
        are currently accepting referrals. Send an office-only availability inquiry and
        arrange any patient handoff outside PsyAlliance through your usual secure channel.
      </p>

      {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

      <div className="card">
        <ProviderDirectory people={people} specialismOptions={specialismOptions} submitReferral={submitReferral} />
      </div>
    </div>
  );
}
