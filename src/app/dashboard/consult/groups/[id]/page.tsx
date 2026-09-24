import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  inviteInternalMemberAction,
  inviteExternalAction,
  respondToGroupInviteAction,
  leaveGroupAction,
  removeGroupMemberAction,
  updateCharterAction,
} from "../actions";
import { PageHead, Banner, Empty, Status, PersonAvatar } from "../../../_components/ui";

const MEMBER_STATUS: Record<string, string> = { invited: "Invited", joined: "Member", declined: "Declined", left: "Left", removed: "Removed" };

// One consultation group: charter first (it's what members agree to),
// then the group's threads, then members. Posting goes through the normal
// Consult compose with the group preselected, so the de-identification
// check and the review step apply here too.
export default async function ConsultationGroupPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await props.params;
  const { error } = await props.searchParams;
  const groupId = Number(id);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;

  const { data: group } = await supabase.from("consultation_groups").select("*").eq("id", groupId).maybeSingle();
  if (!group) redirect("/dashboard/consult/groups?error=" + encodeURIComponent("That group isn't available."));
  const isCreator = group.created_by === me;

  const [{ data: members }, { data: mine }, { data: threads }, { data: conns }] = await Promise.all([
    supabase
      .from("consultation_group_members")
      .select("id, profile_id, external_email, status, role, member:profile_id(full_name, credential_prefix)")
      .eq("group_id", groupId)
      .order("invited_at", { ascending: true }),
    supabase.from("consultation_group_members").select("id, status").eq("group_id", groupId).eq("profile_id", me).maybeSingle(),
    supabase
      .from("consultations")
      .select("id, question, status, created_at, author_profile_id, author:author_profile_id(full_name, credential_prefix), consultation_responses(id)")
      .eq("group_id", groupId)
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    isCreator
      ? supabase
          .from("connections")
          .select("requester_id, addressee_id, requester:requester_id(full_name, credential_prefix), addressee:addressee_id(full_name, credential_prefix)")
          .eq("status", "accepted")
          .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  if (!isCreator && !mine) redirect("/dashboard/consult/groups?error=" + encodeURIComponent("That group isn't available."));

  const isMember = isCreator || mine?.status === "joined";
  const nameOf = (p: any) => (p ? `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}` : "Member");
  const existing = new Set((members || []).map((m: any) => m.profile_id).filter(Boolean));
  const candidates = (conns || [])
    .map((c: any) => (c.requester_id === me ? { id: c.addressee_id, ...c.addressee } : { id: c.requester_id, ...c.requester }))
    .filter((c: any) => c.id && !existing.has(c.id));
  const activeMembers = (members || []).filter((m: any) => ["joined", "invited"].includes(m.status));

  return (
    <>
      <div className="breadcrumbs small" style={{ marginBottom: 14 }}>
        <a href="/dashboard/consult">Consult</a> / <a href="/dashboard/consult/groups">Groups</a> / <b>{group.name}</b>
      </div>
      <PageHead
        eyebrow="Consultation group"
        title={group.name}
        lead={[group.purpose, group.cadence, group.meeting_format ? String(group.meeting_format).replace("_", " ") : null].filter(Boolean).join(" · ") || undefined}
        actions={
          isMember && group.charter_body ? (
            <a className="btn" href={`/dashboard/consult/new?group=${group.id}`}>Ask this group</a>
          ) : undefined
        }
      />
      <Banner error={error} />

      {mine?.status === "invited" && (
        <section className="card tint" style={{ marginBottom: 20 }}>
          <div className="card-title"><h3>You&rsquo;re invited</h3><Status tone="warn">Read the charter first</Status></div>
          <p className="small">Joining means agreeing to the charter below.</p>
          <div className="row" style={{ gap: 8 }}>
            <form action={respondToGroupInviteAction} className="inline">
              <input type="hidden" name="membership_id" value={mine.id} />
              <input type="hidden" name="status" value="joined" />
              <button type="submit" className="btn small-btn">Join the group</button>
            </form>
            <form action={respondToGroupInviteAction} className="inline">
              <input type="hidden" name="membership_id" value={mine.id} />
              <input type="hidden" name="status" value="declined" />
              <button type="submit" className="btn ghost small-btn">Decline</button>
            </form>
          </div>
        </section>
      )}

      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="card-title"><h3>Group threads</h3><span className="micro-note">Members only</span></div>
            {!group.charter_body ? (
              <div className="tone-panel">This group needs a charter before anyone can post. {isCreator ? "Write it on the right." : "The organiser is writing it."}</div>
            ) : (threads || []).length === 0 ? (
              <Empty symbol={"✳"} title="Nothing posted yet." body="Bring a de-identified case question to the group." action={isMember ? <a className="btn secondary small-btn" href={`/dashboard/consult/new?group=${group.id}`}>Ask this group</a> : undefined} />
            ) : (
              (threads || []).map((t: any) => (
                <a key={t.id} href={`/dashboard/consult/${t.id}`} className="list-row" style={{ textDecoration: "none", color: "inherit" }}>
                  <span>
                    <strong>{t.question}</strong>
                    <small>
                      {t.author_profile_id === me ? "You" : nameOf(t.author)} &middot; {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} &middot; {(t.consultation_responses || []).length} repl{(t.consultation_responses || []).length === 1 ? "y" : "ies"}
                    </small>
                  </span>
                  <Status tone={t.status === "resolved" ? "neutral" : ""}>{t.status === "resolved" ? "Resolved" : "Open"}</Status>
                </a>
              ))
            )}
          </section>

          <section className="card">
            <div className="card-title"><h3>Members</h3><span className="micro-note">{activeMembers.length}</span></div>
            {(members || []).map((m: any) => (
              <div key={m.id} className="item row between">
                <span className="row" style={{ gap: 10 }}>
                  {m.profile_id ? <PersonAvatar name={m.member?.full_name || "?"} size={30} /> : null}
                  <span>
                    {m.profile_id ? (
                      <a href={m.profile_id === me ? "/dashboard/profile" : `/dashboard/people/${m.profile_id}`}><strong>{m.profile_id === me ? "You" : nameOf(m.member)}</strong></a>
                    ) : (
                      <strong>{m.external_email} <span className="micro-note">(invited by email)</span></strong>
                    )}
                    <p>{m.role === "owner" || m.profile_id === group.created_by ? "Organiser" : MEMBER_STATUS[m.status] || m.status}</p>
                  </span>
                </span>
                {isCreator && m.profile_id !== group.created_by && ["joined", "invited"].includes(m.status) && (
                  <form action={removeGroupMemberAction} className="inline">
                    <input type="hidden" name="group_id" value={group.id} />
                    <input type="hidden" name="membership_id" value={m.id} />
                    <button type="submit" className="plain-button small">Remove</button>
                  </form>
                )}
              </div>
            ))}
            {isCreator && group.charter_body && (
              <div className="fields" style={{ marginTop: 14 }}>
                <form action={inviteInternalMemberAction} className="stack" style={{ gap: 8 }}>
                  <input type="hidden" name="group_id" value={group.id} />
                  <label className="field">
                    Invite a trusted colleague
                    <select name="profile_id" defaultValue="" required>
                      <option value="" disabled>{candidates.length ? "Choose someone" : "No trusted colleagues to invite"}</option>
                      {candidates.map((c: any) => (
                        <option key={c.id} value={c.id}>{nameOf(c)}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="btn secondary small-btn" style={{ alignSelf: "flex-start" }}>Invite</button>
                </form>
                <form action={inviteExternalAction} className="stack" style={{ gap: 8 }}>
                  <input type="hidden" name="group_id" value={group.id} />
                  <label className="field">
                    Invite a colleague not on PsyAlliance yet
                    <input name="external_email" type="email" placeholder="colleague@practice.com" required />
                  </label>
                  <button type="submit" className="btn secondary small-btn" style={{ alignSelf: "flex-start" }}>Invite by email</button>
                </form>
              </div>
            )}
            {!isCreator && mine?.status === "joined" && (
              <form action={leaveGroupAction} style={{ marginTop: 12 }}>
                <input type="hidden" name="group_id" value={group.id} />
                <input type="hidden" name="membership_id" value={mine.id} />
                <button type="submit" className="plain-button small">Leave this group</button>
              </form>
            )}
          </section>
        </div>

        <aside className="stack">
          <section className="card tint">
            <div className="card-title"><h3>Charter</h3><span className="micro-note">Version {group.charter_version}</span></div>
            {group.charter_body ? (
              <p className="small" style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{group.charter_body}</p>
            ) : (
              <p className="small">No charter yet.</p>
            )}
            {isCreator && (
              <details style={{ marginTop: 12 }} open={!group.charter_body}>
                <summary className="small" style={{ cursor: "pointer" }}>{group.charter_body ? "Edit the charter" : "Write the charter"}</summary>
                <form action={updateCharterAction} style={{ marginTop: 10 }}>
                  <input type="hidden" name="group_id" value={group.id} />
                  <label className="field">
                    <span className="sr-only">Charter</span>
                    <textarea name="charter_body" rows={6} defaultValue={group.charter_body || ""} placeholder="Confidentiality, de-identification, consultation not supervision, no recording, how cases are presented." />
                  </label>
                  <button type="submit" className="btn secondary small-btn" style={{ marginTop: 8 }}>Save as version {group.charter_version + 1}</button>
                </form>
              </details>
            )}
          </section>
          <section className="card">
            <div className="eyebrow">From the Practice Library</div>
            <h3>PA-04 &middot; Group Charter</h3>
            <p className="small">A model charter, member agreement and 90-minute agenda.</p>
            <a className="btn secondary small-btn" href="/dashboard/documents/PA-04">View PA-04</a>
          </section>
        </aside>
      </div>
    </>
  );
}
