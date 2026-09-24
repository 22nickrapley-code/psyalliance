import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  inviteInternalMemberAction,
  inviteExternalAction,
  respondToGroupInviteAction,
  leaveGroupAction,
  removeGroupMemberAction,
  updateCharterAction,
  postGroupConsultationAction,
} from "../actions";
import { respondToConsultationAction, resolveConsultationAction } from "../../actions";
import WorkflowResources from "@/components/workflow-resources";

const MEMBER_STATUS_LABELS: Record<string, string> = {
  invited: "Invited",
  joined: "Joined",
  declined: "Declined",
  left: "Left",
  removed: "Removed",
};

// PsyA2 #66 (Group space): member list, charter, group discussion
// (consultations posted to this group). Agenda templates and a private
// group-resources area aren't in this first pass - see the file header on
// ../actions.ts for the full scope note.
export default async function ConsultationGroupPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await props.params;
  const { error } = await props.searchParams;
  const groupId = Number(id);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const { data: group } = await supabase.from("consultation_groups").select("*").eq("id", groupId).maybeSingle();
  // RLS already hides a group you're not a member or creator of - a null
  // row here means "not found or not yours to see," same thing to the UI.
  if (!group) redirect("/dashboard/consult/groups?error=" + encodeURIComponent("That group isn't available."));

  const isCreator = group.created_by === myself;

  const [{ data: members }, { data: myMembership }, { data: consultations }, { data: myConnections }] = await Promise.all([
    supabase
      .from("consultation_group_members")
      .select("id, profile_id, external_email, status, role, invited_at, member:profile_id(full_name, credential_prefix)")
      .eq("group_id", groupId)
      .order("invited_at", { ascending: true }),
    supabase.from("consultation_group_members").select("id, status").eq("group_id", groupId).eq("profile_id", myself).maybeSingle(),
    supabase
      .from("consultations")
      .select("*, author:author_profile_id(full_name, credential_prefix), consultation_responses(*, profiles:responder_profile_id(full_name))")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false }),
    isCreator
      ? supabase
          .from("connections")
          .select("requester_id, addressee_id, requester:requester_id(full_name, credential_prefix), addressee:addressee_id(full_name, credential_prefix)")
          .eq("status", "accepted")
          .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // A member who has left/declined, or the creator (already seeing
  // everything by virtue of being the creator), shouldn't be blocked from
  // viewing - but only an actual invited/joined member or the creator
  // should be able to act on invitations below.
  if (!isCreator && !["invited", "joined"].includes(myMembership?.status || "")) redirect("/dashboard/consult/groups?error=" + encodeURIComponent("That group isn't available."));

  const existingMemberIds = new Set((members || []).map((m: any) => m.profile_id).filter(Boolean));
  const inviteCandidates = (myConnections || [])
    .map((c: any) => (c.requester_id === myself ? { id: c.addressee_id, ...c.addressee } : { id: c.requester_id, ...c.requester }))
    .filter((c: any) => c.id && !existingMemberIds.has(c.id));

  return (
    <div>
      <p className="muted" style={{ marginBottom: "0.3rem" }}>
        <a href="/dashboard/consult/groups">&larr; All consultation groups</a>
      </p>
      <h1>{group.name}</h1>
      <WorkflowResources codes={["PA-04"]} />
      {group.purpose && <p className="muted">{group.purpose}</p>}
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        {group.cadence && <>Cadence: {group.cadence} · </>}
        {group.meeting_format && <>Format: {group.meeting_format.replace("_", " ")} · </>}
        Charter v{group.charter_version}
      </p>
      {error && <div className="error-banner">{error}</div>}

      {myMembership && myMembership.status === "invited" && (
        <div className="card">
          <h2>You're invited</h2>
          <span className="person-row-actions">
            <form action={respondToGroupInviteAction}>
              <input type="hidden" name="membership_id" value={myMembership.id} />
              <input type="hidden" name="status" value="joined" />
              <label className="checkbox-row"><input type="checkbox" name="acknowledge_charter" required /> I have read and agree to the charter below.</label>
              <button type="submit">Join</button>
            </form>
            <form action={respondToGroupInviteAction}>
              <input type="hidden" name="membership_id" value={myMembership.id} />
              <input type="hidden" name="status" value="declined" />
              <button type="submit" className="secondary">Decline</button>
            </form>
          </span>
        </div>
      )}

      <div className="card">
        <h2>Charter</h2>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          A working document, not fixed - confidentiality, de-identification, consultation vs. supervision,
          no automatic recording, no patient detail in general group discussion.
        </p>
        {group.charter_body ? (
          <p style={{ whiteSpace: "pre-wrap" }}>{group.charter_body}</p>
        ) : (
          <p className="muted">No charter written yet.</p>
        )}
        {isCreator && (
          <details style={{ marginTop: "0.4rem" }}>
            <summary className="muted" style={{ cursor: "pointer", fontSize: "0.85rem" }}>Edit charter</summary>
            <form action={updateCharterAction} style={{ marginTop: "0.4rem" }}>
              <input type="hidden" name="group_id" value={group.id} />
              <div className="field">
                <textarea name="charter_body" rows={4} defaultValue={group.charter_body || ""} />
              </div>
              <button type="submit" className="secondary">Save charter (bumps to v{group.charter_version + 1})</button>
            </form>
          </details>
        )}
      </div>

      {/* Sept 23 audit (task #125): a group used to be immediately usable
          (invite people, post consultations) with no charter at all, even
          though the charter card above frames it as the thing that makes a
          group different from a one-off consult - confidentiality,
          de-identification, consultation vs. supervision. Now it has to
          actually be written first; the invite/post forms below are gated
          on it server-side too (inviteInternalMemberAction,
          inviteExternalAction, postGroupConsultationAction). */}
      {isCreator && !group.charter_body && (
        <div className="card" style={{ borderColor: "var(--accent, #d97)", background: "rgba(217,153,0,0.08)" }}>
          Write the charter above before inviting anyone or posting to this group - it's what sets the
          confidentiality and de-identification expectations everyone in it is agreeing to.
        </div>
      )}

      <div className="card">
        <h2>Members ({(members || []).length})</h2>
        {(members || []).map((m: any) => (
          <div key={m.id} className="person-row">
            <span className="person-row-info">
              {m.profile_id ? (
                <a href={`/dashboard/people/${m.profile_id}`} className="person-link">
                  {m.member?.credential_prefix ? `${m.member.credential_prefix} ` : ""}
                  {m.member?.full_name || "Member"}
                </a>
              ) : (
                <span>{m.external_email} <span className="muted">(external)</span></span>
              )}{" "}
              <span className="tag">{m.role}</span> <span className="tag">{MEMBER_STATUS_LABELS[m.status] || m.status}</span>
            </span>
            {isCreator && m.profile_id !== group.created_by && (
              <span className="person-row-actions">
                <form action={removeGroupMemberAction}>
                  <input type="hidden" name="group_id" value={group.id} />
                  <input type="hidden" name="membership_id" value={m.id} />
                  <button type="submit" className="danger">Remove</button>
                </form>
              </span>
            )}
          </div>
        ))}

        {isCreator && group.charter_body && (
          <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <form action={inviteInternalMemberAction}>
              <input type="hidden" name="group_id" value={group.id} />
              <div className="field-row" style={{ alignItems: "flex-end" }}>
                <div className="field">
                  <label htmlFor="profile_id">Invite a trusted colleague</label>
                  <select id="profile_id" name="profile_id" defaultValue="">
                    <option value="" disabled>Choose someone</option>
                    {inviteCandidates.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.credential_prefix ? `${c.credential_prefix} ` : ""}
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="secondary">Invite</button>
              </div>
            </form>
            <form action={inviteExternalAction}>
              <input type="hidden" name="group_id" value={group.id} />
              <div className="field-row" style={{ alignItems: "flex-end" }}>
                <div className="field">
                  <label htmlFor="external_email">Cold-start invite by email</label>
                  <input id="external_email" name="external_email" type="email" placeholder="colleague@example.com" />
                </div>
                <button type="submit" className="secondary">Invite</button>
              </div>
            </form>
          </div>
        )}

        {!isCreator && myMembership?.status === "joined" && (
          <form action={leaveGroupAction} style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="group_id" value={group.id} />
            <input type="hidden" name="membership_id" value={myMembership.id} />
            <button type="submit" className="danger">Leave group</button>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Group consultations</h2>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Visible only to this group's members, whatever else the audience picker says - still keep it
          de-identified.
        </p>
        {(myMembership?.status === "joined" || isCreator) && group.charter_body && (
          <form action={postGroupConsultationAction} style={{ marginBottom: "1rem" }}>
            <input type="hidden" name="group_id" value={group.id} />
            <div className="field">
              <label htmlFor="gq">What do you need help thinking through?</label>
              <input id="gq" name="question" type="text" placeholder="One-sentence question" required />
            </div>
            <div className="field">
              <label htmlFor="gctx">Context (optional, de-identified)</label>
              <textarea id="gctx" name="context" rows={2} />
            </div>
            <div className="checkbox-row">
              <input id="g_deidentification_confirmed" name="deidentification_confirmed" type="checkbox" required />
              <label htmlFor="g_deidentification_confirmed" style={{ margin: 0, fontWeight: 400 }}>
                I confirm this is de-identified - no patient names, exact dates, addresses, or other identifying details
              </label>
            </div>
            <button type="submit" className="secondary" style={{ marginTop: "0.5rem" }}>Post to this group</button>
          </form>
        )}
        {(myMembership?.status === "joined" || isCreator) && !group.charter_body && (
          <p className="muted" style={{ marginBottom: "1rem" }}>
            This group needs a charter before anyone can post to it - see above.
          </p>
        )}

        {(consultations || []).map((c: any) => (
          <div key={c.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <strong>{c.question}</strong> <span className="tag">{c.status.replace("_", " ")}</span>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {c.author?.credential_prefix ? `${c.author.credential_prefix} ` : ""}
              {c.author?.full_name}
            </p>
            {c.context && <p className="muted">{c.context}</p>}
            {(c.consultation_responses || []).length > 0 && (
              <div style={{ marginTop: "0.4rem" }}>
                {c.consultation_responses.map((r: any) => (
                  <p key={r.id} style={{ fontSize: "0.9rem", margin: "0.2rem 0" }}>
                    <strong>{r.profiles?.full_name}:</strong> {r.body}
                  </p>
                ))}
              </div>
            )}
            {c.author_profile_id !== myself && (myMembership?.status === "joined" || isCreator) && (
              <form action={respondToConsultationAction} style={{ marginTop: "0.4rem" }}>
                <input type="hidden" name="consultation_id" value={c.id} />
                <div className="field-row">
                  <div className="field" style={{ flex: 1 }}>
                    <input name="body" type="text" placeholder="Reply" />
                  </div>
                  <button type="submit" className="secondary">Reply</button>
                </div>
              </form>
            )}
            {c.author_profile_id === myself && ["open", "responses_received"].includes(c.status) && (
              <form action={resolveConsultationAction} style={{ marginTop: "0.3rem" }}>
                <input type="hidden" name="consultation_id" value={c.id} />
                <button type="submit" className="secondary">Mark resolved</button>
              </form>
            )}
          </div>
        ))}
        {(consultations || []).length === 0 && <p className="muted">Nothing posted to this group yet.</p>}
      </div>
    </div>
  );
}
