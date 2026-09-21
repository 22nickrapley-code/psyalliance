import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl, resolveAvatarUrls } from "@/lib/avatars";
import { sendConnectionRequest, respondToConnection, removeConnection } from "../../network/actions";
import { startConversation } from "../../messages/actions";
import { addToBlocklist, removeFromBlocklist } from "../../settings/actions";
import { submitEndorsement, deleteEndorsement, assignColleagueToClient, markSentToPatient } from "../actions";
import { ProfileView, type SpecialismValue } from "../../profile-view";
import Avatar from "../../avatar";

function TierBadge({ tier }: { tier: "partner" | "bench" | "pending-out" | "pending-in" | null }) {
  if (!tier) return null;
  if (tier === "partner") return <span className="tag tier-partner">Partner</span>;
  if (tier === "bench") return <span className="tag tier-bench">Bench</span>;
  if (tier === "pending-out") return <span className="tag">Request sent</span>;
  return <span className="tag">Wants to connect</span>;
}

export default async function PersonProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; match?: string }>;
}) {
  const { id } = await params;
  const { error, match } = await searchParams;
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
    { data: myActiveCases },
    { data: blockRow },
    { data: endorsements },
    { data: myEndorsement },
    { data: myAssignments },
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
    supabase
      .from("caseload_clients")
      .select("id, private_label, primary_need, secondary_need, tertiary_need, state, session_type, insurance, book_of_business_id, books_of_business(name)")
      .eq("profile_id", myself)
      .eq("is_active", true)
      .order("private_label"),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself).eq("blocked_profile_id", id).maybeSingle(),
    supabase
      .from("endorsements")
      .select("*, endorser:endorser_id(full_name, credential_prefix, avatar_path)")
      .eq("endorsee_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("endorsements").select("body").eq("endorser_id", myself).eq("endorsee_id", id).maybeSingle(),
    supabase
      .from("referral_assignments")
      .select("*, caseload_clients(private_label)")
      .eq("profile_id", myself)
      .eq("assigned_profile_id", id)
      .order("created_at", { ascending: false }),
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

  let tier: "partner" | "bench" | "pending-out" | "pending-in" | null = null;
  if (connection) {
    if (connection.status === "accepted") tier = connection.tier;
    else if (connection.status === "pending") {
      tier = connection.requester_id === myself ? "pending-out" : "pending-in";
    }
  }

  // "Match me" / "Match my caseload" - two different overlap computations
  // against this colleague, only offered while not yet connected (once
  // connected, the existing shared-specialism "Recommended for you" logic
  // above already covers the relevance story). Both span every specialism
  // category (not just treatment specialisms), since the chip highlighting
  // is generic - only the two locations differ in what they compare.
  const matchMode = match === "caseload" ? "caseload" : "me";
  let highlightValues: string[] = [];
  let locationMatch = false;
  if (!tier) {
    if (matchMode === "caseload") {
      const caseloadNeeds = new Set<string>();
      const caseloadStates = new Set<string>();
      for (const c of myActiveCases || []) {
        for (const v of [c.primary_need, c.secondary_need, c.tertiary_need, c.session_type, c.insurance]) {
          if (v) caseloadNeeds.add(v);
        }
        if (c.state) caseloadStates.add(c.state);
      }
      highlightValues = [...caseloadNeeds];
      locationMatch = (!!first.primary_state && caseloadStates.has(first.primary_state)) || !!first.psypact_participating;
    } else {
      const myAllValues = new Set(
        (myLookups || []).map((l: any) => l.lookup_values?.value).filter(Boolean)
      );
      highlightValues = [...myAllValues];
      locationMatch = !!myProfile?.primary_state && myProfile.primary_state === first.primary_state;
    }
  }

  const isBlocked = !!blockRow;

  const displayName = `${first.credential_prefix ? first.credential_prefix + " " : ""}${first.full_name}`.trim();

  const MatchToggle = () => (
    <div className="match-toggle-group">
      <a href={`/dashboard/people/${id}?match=me`} className={matchMode === "me" ? "active" : ""}>
        Match me
      </a>
      <a href={`/dashboard/people/${id}?match=caseload`} className={matchMode === "caseload" ? "active" : ""}>
        Match my caseload
      </a>
    </div>
  );

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
          highlightValues={highlightValues}
          locationMatch={locationMatch}
          matchToggle={!tier ? <MatchToggle /> : undefined}
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
            </>
          }
          belowHeader={
            !isBlocked && (
              <div className="card" style={{ marginBottom: "0.9rem" }}>
                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    Assign to Patient
                  </summary>
                  <div style={{ marginTop: "0.6rem" }}>
                    {myActiveCases && myActiveCases.length > 0 ? (
                      <form action={assignColleagueToClient} className="field-row" style={{ alignItems: "flex-end" }}>
                        <input type="hidden" name="assigned_profile_id" value={first.id} />
                        <div className="field">
                          <label htmlFor="caseload_client_id">Client</label>
                          <select id="caseload_client_id" name="caseload_client_id" required>
                            {myActiveCases.map((c: any) => (
                              <option key={c.id} value={c.id}>
                                {c.private_label}{c.books_of_business?.name ? ` - ${c.books_of_business.name}` : ""}
                                {c.primary_need ? ` (${c.primary_need})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field" style={{ flex: "1 1 220px" }}>
                          <label htmlFor="note">Note (optional)</label>
                          <input id="note" name="note" type="text" maxLength={200} placeholder="Anything to flag for them" />
                        </div>
                        <div className="field" style={{ flex: "0 0 auto" }}>
                          <button type="submit">Assign &amp; notify</button>
                        </div>
                      </form>
                    ) : (
                      <p className="muted">
                        You don't have any active clients to assign yet - add one on{" "}
                        <a href="/dashboard/caseload">Caseload</a> first.
                      </p>
                    )}

                    {myAssignments && myAssignments.length > 0 && (
                      <div style={{ marginTop: "0.75rem" }}>
                        {myAssignments.map((a: any) => (
                          <div key={a.id} className="person-row">
                            <span className="person-row-info">
                              Client {a.caseload_clients?.private_label || "-"}
                              <span className="muted" style={{ marginLeft: "0.4rem" }}>
                                assigned {new Date(a.created_at).toLocaleDateString()}
                              </span>
                            </span>
                            <span className="person-row-actions">
                              {a.sent_to_patient ? (
                                <span className="tag">Sent to patient</span>
                              ) : (
                                <form action={markSentToPatient}>
                                  <input type="hidden" name="id" value={a.id} />
                                  <input type="hidden" name="assigned_profile_id" value={first.id} />
                                  <button type="submit" className="secondary" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
                                    Send Practitioner Details to Patient
                                  </button>
                                </form>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )
          }
          sidebarExtra={
            <div className="card">
              <h3 style={{ marginTop: 0, fontSize: "0.95rem" }}>Endorsements ({(endorsements || []).length})</h3>
              <details style={{ marginBottom: "0.6rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                  {myEndorsement ? "Edit your endorsement" : "Endorse " + first.full_name}
                </summary>
                <form action={submitEndorsement} style={{ marginTop: "0.5rem" }}>
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
              </details>
              {(endorsements || []).map((e: any) => (
                <div key={e.id} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
                  <Avatar
                    url={endorserAvatarByPath.get(e.endorser?.avatar_path || "") || null}
                    name={e.endorser?.full_name || "?"}
                    size={26}
                  />
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {e.endorser?.credential_prefix ? `${e.endorser.credential_prefix} ` : ""}
                      {e.endorser?.full_name || "Colleague"}
                    </div>
                    <div style={{ fontSize: "0.85rem" }}>{e.body}</div>
                  </div>
                </div>
              ))}
              {(endorsements || []).length === 0 && (
                <p className="muted" style={{ fontSize: "0.85rem" }}>No endorsements yet.</p>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
