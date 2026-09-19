import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl } from "@/lib/avatars";
import { sendConnectionRequest, respondToConnection, removeConnection } from "../../network/actions";
import { startConversation } from "../../messages/actions";
import { ProfileView, type SpecialismValue } from "../../profile-view";

function TierBadge({ tier }: { tier: "partner" | "bench" | "pending-out" | "pending-in" | null }) {
  if (!tier) return null;
  if (tier === "partner") return <span className="tag tier-partner">Partner</span>;
  if (tier === "bench") return <span className="tag tier-bench">Bench</span>;
  if (tier === "pending-out") return <span className="tag">Request sent</span>;
  return <span className="tag">Wants to connect</span>;
}

export default async function PersonProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (id === user!.id) {
    redirect("/dashboard/profile");
  }

  const [{ data: directoryRows }, { data: connection }, { data: myLookups }] = await Promise.all([
    supabase.from("public_directory").select("*").eq("id", id),
    supabase
      .from("connections")
      .select("*")
      .or(`and(requester_id.eq.${user!.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user!.id})`)
      .maybeSingle(),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, lookup_values(category, value)")
      .eq("profile_id", user!.id),
  ]);

  if (!directoryRows || directoryRows.length === 0) {
    return (
      <div>
        <h1>Profile not found</h1>
        <p className="muted">
          This colleague isn't in the verified directory, or their profile isn't public yet.
        </p>
        <a href="/dashboard/network" className="btn secondary">Back to Network</a>
      </div>
    );
  }

  const first = directoryRows[0];
  // A whitelist of categories the polished profile view shows - deliberately
  // excludes the self-disclosure categories (ethnicity, gender identity,
  // sex), which the profile form frames as an opt-in personal disclosure
  // even though public_directory technically carries every category.
  const VISIBLE_CATEGORIES = new Set([
    "treatment_specialism",
    "treatment_modality",
    "insurance",
    "language",
    "session_type",
    "age_group_specialism",
    "sexual_orientation_specialism",
  ]);
  const specialismsByCategory: Record<string, SpecialismValue[]> = {};
  for (const row of directoryRows) {
    if (!row.category || !VISIBLE_CATEGORIES.has(row.category)) continue;
    specialismsByCategory[row.category] = specialismsByCategory[row.category] || [];
    specialismsByCategory[row.category].push({ value: row.value, rank: row.rank });
  }

  const avatarUrl = await resolveAvatarUrl(supabase, first.avatar_path);

  const mySpecialisms = new Set(
    (myLookups || [])
      .filter((l: any) => l.lookup_values?.category === "treatment_specialism")
      .map((l: any) => l.lookup_values.value)
  );
  const theirSpecialisms = specialismsByCategory["treatment_specialism"] || [];
  const relevantSpecialisms = theirSpecialisms
    .map((s) => s.value)
    .filter((v) => mySpecialisms.has(v));

  let tier: "partner" | "bench" | "pending-out" | "pending-in" | null = null;
  if (connection) {
    if (connection.status === "accepted") tier = connection.tier;
    else if (connection.status === "pending") {
      tier = connection.requester_id === user!.id ? "pending-out" : "pending-in";
    }
  }

  const displayName = `${first.credential_prefix ? first.credential_prefix + " " : ""}${first.full_name}`.trim();

  return (
    <div>
      <a href="/dashboard/network" className="muted" style={{ fontSize: "0.85rem" }}>&larr; Back to Network</a>

      {tier === "pending-in" && connection && (
        <div className="card" style={{ marginTop: "0.75rem" }}>
          <strong>{displayName}</strong> wants to connect as <strong>{connection.tier}</strong>.
          <div style={{ marginTop: "0.5rem" }}>
            <form action={respondToConnection} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={connection.id} />
              <input type="hidden" name="decision" value="accepted" />
              <button type="submit">Accept</button>
            </form>{" "}
            <form action={respondToConnection} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={connection.id} />
              <input type="hidden" name="decision" value="declined" />
              <button type="submit" className="secondary">Decline</button>
            </form>
          </div>
        </div>
      )}

      <div style={{ marginTop: "0.75rem" }}>
        <ProfileView
          data={{
            id: first.id,
            fullName: first.full_name,
            credentialPrefix: first.credential_prefix,
            qualificationLevel: first.qualification_level,
            boardCertified: first.board_certified,
            city: first.primary_practice_city,
            state: first.primary_state,
            acceptingReferrals: first.accepting_referrals,
            psypactParticipating: first.psypact_participating,
            avatarUrl,
            practiceWebsite: first.practice_website,
            contactPhone: first.contact_phone,
            contactEmail: first.contact_email,
            openToGroupConsultation: first.open_to_group_consultation,
            openToGiveSupervision: first.open_to_give_supervision,
            openToReceiveSupervision: first.open_to_receive_supervision,
            specialismsByCategory,
          }}
          tierBadge={<TierBadge tier={tier} />}
          relevantSpecialisms={!tier ? relevantSpecialisms : []}
          actions={
            <>
              <form action={startConversation} style={{ display: "inline" }}>
                <input type="hidden" name="participant_ids" value={first.id} />
                <input type="hidden" name="title" value={displayName} />
                <input type="hidden" name="body" value={`Hi ${first.full_name}, `} />
                <button type="submit" className="secondary">Message</button>
              </form>
              {tier === "partner" || tier === "bench" ? (
                <form action={removeConnection} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={connection!.id} />
                  <button type="submit" className="secondary">Remove connection</button>
                </form>
              ) : tier === "pending-out" ? (
                <button type="button" className="secondary" disabled>Request sent</button>
              ) : tier === "pending-in" ? null : (
                <>
                  <form action={sendConnectionRequest} style={{ display: "inline" }}>
                    <input type="hidden" name="addressee_id" value={first.id} />
                    <input type="hidden" name="tier" value="partner" />
                    <button type="submit">Connect (Partner)</button>
                  </form>
                  <form action={sendConnectionRequest} style={{ display: "inline" }}>
                    <input type="hidden" name="addressee_id" value={first.id} />
                    <input type="hidden" name="tier" value="bench" />
                    <button type="submit" className="secondary">Add to Bench</button>
                  </form>
                </>
              )}
            </>
          }
        />
      </div>
    </div>
  );
}
