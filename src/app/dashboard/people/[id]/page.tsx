import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl, resolveAvatarUrls } from "@/lib/avatars";
import { sendConnectionRequest, respondToConnection, removeConnection, saveClinicianAction, removeSavedClinicianAction } from "../../network/actions";
import { startConversation } from "../../messages/actions";
import { addToBlocklist, removeFromBlocklist } from "../../settings/actions";
import { submitEndorsement, deleteEndorsement } from "../actions";
import { ProfileView, type SpecialismValue } from "../../profile-view";
import Avatar from "../../avatar";
import { fileReportAction } from "../../moderation-actions";

function TierBadge({ tier }: { tier: "partner" | "trusted_colleague" | "bench" | "pending-out" | "pending-in" | null }) {
  if (!tier) return null;
  if (tier === "partner" || tier === "trusted_colleague") return <span className="tag tier-trusted_colleague">Trusted Colleague</span>;
  if (tier === "bench") return <span className="tag tier-bench">Bench</span>;
  if (tier === "pending-out") return <span className="tag">Request sent</span>;
  return <span className="tag">Wants to connect</span>;
}

export default async function PersonProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  if (id === myself) {
    redirect("/dashboard/profile");
  }

  const [
    { data: directoryRows },
    { data: connection },
    { data: myLookups },
    { data: myProfile },
    { data: blockRow },
    { data: endorsements },
    { data: myEndorsement },
    { data: savedRow },
  ] = await Promise.all([
    supabase.from("public_directory").select("*").eq("id", id),
    supabase
      .from("connections")
      .select("*")
      .or(`and(requester_id.eq.${myself},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${myself})`)
      .maybeSingle(),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, lookup_values(category, value)")
      .eq("profile_id", myself),
    supabase.from("profiles").select("primary_practice_city, primary_state").eq("id", myself).maybeSingle(),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself).eq("blocked_profile_id", id).maybeSingle(),
    supabase
      .from("endorsements")
      .select("*, endorser:endorser_id(full_name, credential_prefix, avatar_path)")
      .eq("endorsee_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("endorsements").select("body").eq("endorser_id", myself).eq("endorsee_id", id).maybeSingle(),
    supabase.from("saved_clinicians").select("id").eq("profile_id", myself).eq("clinician_id", id).maybeSingle(),
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
  const endorserAvatarByPath = await resolveAvatarUrls(
    supabase,
    (endorsements || []).map((e: any) => e.endorser?.avatar_path)
  );

  const mySpecialisms = new Set(
    (myLookups || [])
      .filter((l: any) => l.lookup_values?.category === "treatment_specialism")
      .map((l: any) => l.lookup_values.value)
  );
  const theirSpecialisms = specialismsByCategory["treatment_specialism"] || [];
  const relevantSpecialisms = theirSpecialisms
    .map((s) => s.value)
    .filter((v) => mySpecialisms.has(v));

  let tier: "partner" | "trusted_colleague" | "bench" | "pending-out" | "pending-in" | null = null;
  if (connection) {
    if (connection.status === "accepted") tier = connection.tier;
    else if (connection.status === "pending") {
      tier = connection.requester_id === myself ? "pending-out" : "pending-in";
    }
  }

  // Shared-profile highlighting (Match me). The old "Match my caseload"
  // mode read patient-level caseload records and was removed with the
  // Legacy caseload (Product Spec v1, re-audit R4).
  let highlightValues: string[] = [];
  let locationMatch = false;
  if (!tier) {
    const myAllValues = new Set((myLookups || []).map((l: any) => l.lookup_values?.value).filter(Boolean));
    highlightValues = [...myAllValues];
    locationMatch = !!myProfile?.primary_state && myProfile.primary_state === first.primary_state;
  }

  const isBlocked = !!blockRow;

  const displayName = `${first.credential_prefix ? first.credential_prefix + " " : ""}${first.full_name}`.trim();

  // Banner tint: real connection tier wins; otherwise "Recommended" is the
  // same shared-specialism-and-not-yet-connected definition used everywhere
  // else in the app (Overview, Network, Messages), which relevantSpecialisms
  // above already computes.
  const bannerTier: "partner" | "trusted_colleague" | "bench" | "recommended" | "none" =
    tier === "partner" || tier === "trusted_colleague" ? "trusted_colleague" : tier === "bench" ? "bench" : !tier && relevantSpecialisms.length > 0 ? "recommended" : "none";

  return (
    <div>
      <a href="/dashboard/network" className="muted" style={{ fontSize: "0.85rem" }}>&larr; Back to Network</a>

      {error && <div className="error-banner" style={{ marginTop: "0.75rem" }}>{error}</div>}

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
            referralAvailability: first.referral_availability ?? null,
            availabilityConfirmedAt: first.availability_confirmed_at ?? null,
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
          bannerTier={bannerTier}
          relevantSpecialisms={!tier ? relevantSpecialisms : []}
          highlightValues={highlightValues}
          locationMatch={locationMatch}
          actions={
            <>
              <form action={startConversation} style={{ display: "inline" }}>
                <input type="hidden" name="participant_ids" value={first.id} />
                <input type="hidden" name="title" value={displayName} />
                <input type="hidden" name="body" value={`Hi ${first.full_name}, `} />
                <button type="submit" className="secondary">Message</button>
              </form>
              {tier === "partner" || tier === "trusted_colleague" || tier === "bench" ? (
                <form action={removeConnection} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={connection!.id} />
                  <button type="submit" className="secondary">Remove connection</button>
                </form>
              ) : tier === "pending-out" ? (
                <button type="button" className="secondary" disabled>Request sent</button>
              ) : tier === "pending-in" ? null : (
                // Sept 23 audit (task #123): Bench retired as a tier a
                // member can newly choose - see the matching note on
                // Network's Recommended row action. Existing Bench
                // connections keep working exactly as before.
                <form action={sendConnectionRequest} style={{ display: "inline" }}>
                  <input type="hidden" name="addressee_id" value={first.id} />
                  <input type="hidden" name="tier" value="trusted_colleague" />
                  <button type="submit" className="btn-tier-trusted_colleague">Connect (Trusted Colleague)</button>
                </form>
              )}
              {savedRow ? (
                <form action={removeSavedClinicianAction} style={{ display: "inline" }}>
                  <input type="hidden" name="clinician_id" value={first.id} />
                  <button type="submit" className="secondary">Saved</button>
                </form>
              ) : (
                <form action={saveClinicianAction} style={{ display: "inline" }}>
                  <input type="hidden" name="clinician_id" value={first.id} />
                  <button type="submit" className="secondary">Save</button>
                </form>
              )}
              {isBlocked ? (
                <form action={removeFromBlocklist} style={{ display: "inline" }}>
                  <input type="hidden" name="blocked_profile_id" value={first.id} />
                  <button type="submit" className="secondary">Un-block (allow again)</button>
                </form>
              ) : (
                <form action={addToBlocklist} style={{ display: "inline" }}>
                  <input type="hidden" name="blocked_profile_id" value={first.id} />
                  <button type="submit" className="danger">Do not work with</button>
                </form>
              )}
              <details style={{ display: "inline-block" }}>
                <summary className="btn secondary" style={{ display: "inline-block", cursor: "pointer" }}>Report</summary>
                <form action={fileReportAction} style={{ marginTop: "0.4rem" }}>
                  <input type="hidden" name="target_type" value="profile" />
                  <input type="hidden" name="target_id" value={first.id} />
                  <input type="hidden" name="return_to" value={`/dashboard/people/${first.id}`} />
                  <div className="field">
                    <textarea name="reason" rows={2} placeholder="What's wrong with this profile?" required />
                  </div>
                  <button type="submit" className="danger">Submit report</button>
                </form>
              </details>
            </>
          }
          sidebarExtra={
            <>
              <div className="card">
                <h3 style={{ marginTop: 0, fontSize: "0.95rem" }}>Endorsements ({(endorsements || []).length})</h3>
                <details className="endorsement-compose-trigger" style={{ marginBottom: "0.7rem" }}>
                  <summary>{myEndorsement ? "Edit your endorsement" : "Endorse " + first.full_name}</summary>
                  <div className="endorsement-compose-panel">
                    <form action={submitEndorsement}>
                      <input type="hidden" name="endorsee_id" value={first.id} />
                      <textarea
                        name="body"
                        rows={2}
                        maxLength={280}
                        required
                        defaultValue={myEndorsement?.body || ""}
                        placeholder={`What's it like working with ${first.full_name}?`}
                        style={{ width: "100%" }}
                      />
                      <button type="submit" className="secondary" style={{ marginTop: "0.35rem" }}>
                        {myEndorsement ? "Save" : "Post endorsement"}
                      </button>
                    </form>
                    {myEndorsement && (
                      <form action={deleteEndorsement} style={{ marginTop: "0.35rem" }}>
                        <input type="hidden" name="endorsee_id" value={first.id} />
                        <button type="submit" className="secondary" style={{ fontSize: "0.8rem" }}>Remove endorsement</button>
                      </form>
                    )}
                  </div>
                </details>
                <div className="endorsement-list">
                  {(endorsements || []).map((e: any) => (
                    <div key={e.id} className="endorsement-item">
                      <Avatar
                        url={endorserAvatarByPath.get(e.endorser?.avatar_path || "") || null}
                        name={e.endorser?.full_name || "?"}
                        size={34}
                      />
                      <div className="endorsement-body-wrap">
                        <div className="endorsement-author">
                          {e.endorser?.credential_prefix ? `${e.endorser.credential_prefix} ` : ""}
                          {e.endorser?.full_name || "Colleague"}
                          <span className="endorsement-date">{new Date(e.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="endorsement-body">&ldquo;{e.body}&rdquo;</p>
                      </div>
                    </div>
                  ))}
                </div>
                {(endorsements || []).length === 0 && (
                  <p className="muted" style={{ fontSize: "0.85rem" }}>No endorsements yet.</p>
                )}
              </div>

            </>
          }
        />
      </div>
    </div>
  );
}
