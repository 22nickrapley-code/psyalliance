import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl } from "@/lib/avatars";
import { professionFor, professionLabel } from "@/lib/profession";
import { sendConnectionRequest, respondToConnection, removeConnection, saveClinicianAction, removeSavedClinicianAction } from "../../network/actions";
import { startConversation } from "../../messages/actions";
import { addToBlocklist, removeFromBlocklist, blockMemberAction } from "../../settings/actions";
import { fileReportAction } from "../../moderation-actions";
import { PageHead, Empty, Banner, PersonAvatar, Status, SummaryList } from "../../_components/ui";

// A colleague's profile (Product Spec v1, Network > Profiles). Top: who
// they are, verified facts on file, availability and your relationship.
// Below: their practice in labelled sections, then factual activity
// signals from real work on the platform (no testimonials or ratings).

const CATEGORY_LABEL: [string, string][] = [
  ["treatment_specialism", "Specialties"],
  ["age_group_specialism", "Populations"],
  ["treatment_modality", "Approaches"],
  ["insurance", "Insurance panels"],
  ["language", "Languages"],
  ["session_type", "Sessions"],
];

const AVAIL = {
  referral: { yes: "Accepting referrals", limited: "Selected referrals only", no: "Not accepting referrals" } as Record<string, string>,
  cover: { yes: "Available for cover", ask_me: "Cover: ask me", no: "Not available for cover" } as Record<string, string>,
  consult: { yes: "Open to consult", limited: "Consult: limited", no: "Not consulting now" } as Record<string, string>,
};

export default async function PersonPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await props.params;
  const { error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;
  if (id === myself) redirect("/dashboard/profile");

  const { data: extra } = await supabase
    .from("profiles")
    .select("bio, approx_spaces, availability_paused_until")
    .eq("id", id)
    .maybeSingle();
  const [{ data: rows }, { data: licenceRows }, { data: connection }, { data: savedRow }, { data: excludedRow }, { data: track }, { data: workedWithMe }] =
    await Promise.all([
      supabase.from("public_directory").select("*").eq("id", id),
      supabase.rpc("network_licence_states"),
      supabase
        .from("connections")
        .select("*")
        .or(`and(requester_id.eq.${myself},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${myself})`)
        .maybeSingle(),
      supabase.from("saved_clinicians").select("id").eq("profile_id", myself).eq("clinician_id", id).maybeSingle(),
      supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself).eq("blocked_profile_id", id).maybeSingle(),
      supabase.rpc("member_track_record", { target: id }).maybeSingle<any>(),
      supabase.from("worked_with_before").select("interaction_count").eq("profile_id", myself).eq("colleague_id", id).maybeSingle(),
    ]);

  if (!rows || rows.length === 0) {
    return (
      <>
        <PageHead eyebrow="Network" title="Profile not available" />
        <Empty title="This colleague isn't listed." body="Only verified members with an active licence on record appear in the network." action={<a className="btn secondary" href="/dashboard/network">Back to Network</a>} />
      </>
    );
  }

  const p = rows[0];
  const name = `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}`;
  const avatarUrl = await resolveAvatarUrl(supabase, p.avatar_path);
  const licenceStates: string[] = (((licenceRows as any[]) || []).find((r) => r.profile_id === id)?.states as string[]) || [];
  const byCat = new Map<string, { v: string; rank: number | null }[]>();
  for (const r of rows) {
    if (!r.category) continue;
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push({ v: r.value, rank: r.rank });
  }
  const age = p.availability_confirmed_at ? Math.floor((Date.now() - new Date(p.availability_confirmed_at).getTime()) / 86_400_000) : null;
  const confirmed = age === null ? "Availability not confirmed" : age === 0 ? "Confirmed today" : `Confirmed ${age} day${age === 1 ? "" : "s"} ago`;

  const status =
    connection?.status === "accepted"
      ? "trusted"
      : connection?.status === "pending"
        ? connection.requester_id === myself
          ? "pending_out"
          : "pending_in"
        : null;
  const relationship =
    status === "trusted" ? "Trusted colleague" : workedWithMe ? "Worked with before" : savedRow ? "Saved" : status === "pending_out" ? "Invitation sent" : status === "pending_in" ? "Wants to connect" : "Verified network";

  // Counts only, from member_track_record (individual events are private).
  const worked = Number(track?.colleagues_worked_with || 0);
  const covers = Number(track?.covers_completed || 0);
  const medianHours = Number(track?.response_samples || 0) >= 3 && track?.median_response_hours != null ? Number(track.median_response_hours) : null;
  const replyLabel = medianHours === null ? null : medianHours < 6 ? "Typically replies within a few hours" : medianHours < 36 ? "Typically replies within a day" : "Typically replies within a few days";
  const signals = [
    worked ? `Worked with ${worked} member${worked === 1 ? "" : "s"}` : null,
    covers ? `Covered for colleagues ${covers} time${covers === 1 ? "" : "s"}` : null,
    replyLabel,
  ].filter(Boolean) as string[];

  return (
    <>
      <a href="/dashboard/network" className="plain-button small">&larr; Network</a>
      <div style={{ height: 14 }} />
      <Banner error={error} />
      {status === "pending_in" && connection && (
        <div className="banner ok row between wrap">
          <span>{name} invited you to their trusted circle.</span>
          <span className="row">
            <form action={respondToConnection} className="inline">
              <input type="hidden" name="id" value={connection.id} />
              <input type="hidden" name="decision" value="accepted" />
              <button type="submit" className="btn small-btn">Accept</button>
            </form>
            <form action={respondToConnection} className="inline">
              <input type="hidden" name="id" value={connection.id} />
              <input type="hidden" name="decision" value="declined" />
              <button type="submit" className="btn ghost small-btn">Decline</button>
            </form>
          </span>
        </div>
      )}

      <section className="profile-hero">
        <PersonAvatar name={p.full_name} url={avatarUrl} size={63} />
        <div>
          <h2>{name}</h2>
          <p>
            {professionLabel(professionFor(p.qualification_level))} &middot; {p.qualification_level}
            {p.primary_practice_city || p.primary_state ? ` · ${[p.primary_practice_city, p.primary_state].filter(Boolean).join(", ")}` : ""}
          </p>
          <div className="chip-row">
            <span className="chip">Verified</span>
            {licenceStates.length > 0 && <span className="chip">Licence on file: {licenceStates.join(", ")}</span>}
            {p.psypact_participating && <span className="chip">PSYPACT</span>}
            {p.board_certified && <span className="chip">Board certified (self-reported)</span>}
            <span className="chip">{relationship}</span>
          </div>
        </div>
        <div className="actions">
          <a className="btn secondary small-btn" href={`/dashboard/refer/new?state=${p.primary_state || ""}`}>Refer</a>
          <a className="btn secondary small-btn" href="/dashboard/cover/new">Ask for cover</a>
          <form action={startConversation} className="inline">
            <input type="hidden" name="participant_ids" value={id} />
            <input type="hidden" name="title" value="" />
            <input type="hidden" name="body" value="" />
            <button type="submit" className="btn secondary small-btn">Message</button>
          </form>
        </div>
      </section>

      <div className="split" style={{ marginTop: 20 }}>
        <div className="stack">
          {extra?.bio && (
            <section className="card">
              <div className="eyebrow">About</div>
              <p style={{ marginTop: 8, marginBottom: 0, whiteSpace: "pre-line" }}>{extra.bio}</p>
            </section>
          )}
          <section className="card">
            <div className="card-title"><h3>Current availability</h3><span className="micro-note">{confirmed}</span></div>
            <SummaryList
              rows={[
                ["Referrals", AVAIL.referral[p.referral_availability] || "Not set"],
                ["Cover", AVAIL.cover[p.coverage_availability] || "Not set"],
                ["Consultation", AVAIL.consult[p.consultation_availability] || "Not set"],
                ["Supervision", p.open_to_give_supervision ? "Open to supervise" : p.open_to_receive_supervision ? "Seeking supervision" : "Not listed"],
                ...(typeof extra?.approx_spaces === "number" ? ([["Spaces for new patients", `About ${extra.approx_spaces}`]] as [string, string][]) : []),
                ...(extra?.availability_paused_until && extra.availability_paused_until >= new Date().toISOString().slice(0, 10)
                  ? ([["Paused until", new Date(extra.availability_paused_until + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })]] as [string, string][])
                  : []),
              ]}
            />
          </section>
          {CATEGORY_LABEL.map(([cat, label]) => {
            const items = (byCat.get(cat) || []).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
            if (items.length === 0) return null;
            return (
              <section key={cat} className="card tight">
                <div className="eyebrow">{label}</div>
                <div className="chip-row" style={{ marginTop: 10 }}>
                  {items.map((i, idx) => (
                    <span key={i.v} className="chip">{cat === "treatment_specialism" && idx < 5 ? `${idx + 1}. ` : ""}{i.v}</span>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <aside className="stack">
          <section className="card tint">
            <div className="eyebrow">Activity on PsyAlliance</div>
            <h3>{signals.length ? "Facts from real work" : "New to the network"}</h3>
            {signals.length ? (
              <ul className="note-list" style={{ paddingLeft: 16, margin: 0 }}>{signals.map((s) => <li key={s}>{s}</li>)}</ul>
            ) : (
              <p className="small">Activity appears here as they complete referrals, cover and consultations with members.</p>
            )}
          </section>
          <section className="card">
            <h3>Your relationship</h3>
            <p className="small">{relationship}{workedWithMe ? ` · ${workedWithMe.interaction_count} collaboration${workedWithMe.interaction_count === 1 ? "" : "s"} together` : ""}</p>
            <div className="stack" style={{ gap: 8 }}>
              {status === "trusted" && connection ? (
                <form action={removeConnection}>
                  <input type="hidden" name="id" value={connection.id} />
                  <button type="submit" className="btn ghost small-btn">Remove from trusted colleagues</button>
                </form>
              ) : status === null ? (
                <form action={sendConnectionRequest}>
                  <input type="hidden" name="addressee_id" value={id} />
                  <input type="hidden" name="tier" value="trusted_colleague" />
                  <button type="submit" className="btn small-btn">Invite to trusted colleagues</button>
                </form>
              ) : null}
              <form action={savedRow ? removeSavedClinicianAction : saveClinicianAction}>
                <input type="hidden" name="clinician_id" value={id} />
                <button type="submit" className="btn secondary small-btn">{savedRow ? "Saved ✓ (remove)" : "Save privately"}</button>
              </form>
              <form action={excludedRow ? removeFromBlocklist : addToBlocklist}>
                <input type="hidden" name="blocked_profile_id" value={id} />
                <button type="submit" className="btn ghost small-btn">{excludedRow ? "Include in suggestions again" : "Exclude from my suggestions"}</button>
              </form>
            </div>
            <p className="micro-note" style={{ marginTop: 8 }}>Saved and Exclude are private. They are never told.</p>
          </section>
          <details className="card tight">
            <summary className="small">Block this member</summary>
            <p className="small" style={{ marginTop: 10 }}>They won&rsquo;t be able to message or invite you, and you&rsquo;ll disappear from each other&rsquo;s directory and suggestions. They aren&rsquo;t told. Undo it in Settings.</p>
            <form action={blockMemberAction}>
              <input type="hidden" name="blocked_profile_id" value={id} />
              <input type="hidden" name="return_to" value="/dashboard/settings?saved=blocked#privacy" />
              <button type="submit" className="btn secondary small-btn">Block</button>
            </form>
          </details>
          <details className="card tight">
            <summary className="small">Report this profile</summary>
            <form action={fileReportAction} style={{ marginTop: 10 }}>
              <input type="hidden" name="target_type" value="profile" />
              <input type="hidden" name="target_id" value={id} />
              <input type="hidden" name="return_to" value={`/dashboard/people/${id}`} />
              <label className="field">What&rsquo;s wrong?<textarea name="reason" required rows={3} /></label>
              <button type="submit" className="btn secondary small-btn" style={{ marginTop: 8 }}>Send to admins</button>
            </form>
          </details>
        </aside>
      </div>
    </>
  );
}
