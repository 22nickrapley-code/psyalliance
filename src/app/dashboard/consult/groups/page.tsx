import { createClient } from "@/lib/supabase/server";
import { createConsultationGroupAction, respondToGroupInviteAction } from "./actions";
import { PageHead, Banner, Empty, Status } from "../../_components/ui";

// Consultation groups (PA-04): small, persistent, closed peer groups with
// a written charter. Your virtual case conference. Lives under Consult.
export default async function ConsultationGroupsPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;

  const [{ data: memberships }, { data: created }] = await Promise.all([
    supabase
      .from("consultation_group_members")
      .select("id, status, role, group:group_id(id, name, purpose, cadence, charter_body, created_by)")
      .eq("profile_id", me)
      .order("invited_at", { ascending: false }),
    supabase.from("consultation_groups").select("id, name, purpose, cadence, charter_body").eq("created_by", me).order("created_at", { ascending: false }),
  ]);

  const invitations = (memberships || []).filter((m: any) => m.status === "invited");
  const joined = (memberships || []).filter((m: any) => m.status === "joined");
  const groups = [
    ...(created || []).map((g: any) => ({ ...g, mine: true })),
    ...joined.filter((m: any) => !(created || []).some((g: any) => g.id === m.group?.id)).map((m: any) => ({ ...m.group, mine: false })),
  ];

  return (
    <>
      <div className="breadcrumbs small" style={{ marginBottom: 14 }}>
        <a href="/dashboard/consult">Consult</a> / <b>Groups</b>
      </div>
      <PageHead
        eyebrow="Consultation groups"
        title="A standing case conference."
        lead="A few colleagues, a written charter, and threads only members see. Different from a one-off question to your circle."
      />
      <Banner error={error} />
      <div className="split">
        <div className="stack">
          {invitations.length > 0 && (
            <section className="card">
              <div className="card-title"><h3>Invitations</h3><Status tone="warn">{invitations.length} waiting</Status></div>
              {invitations.map((m: any) => (
                <div key={m.id} className="item row between wrap">
                  <span>
                    <strong>{m.group?.name}</strong>
                    <p>{m.group?.purpose || "Consultation group"}</p>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <a className="btn ghost small-btn" href={`/dashboard/consult/groups/${m.group?.id}`}>Read charter</a>
                    <form action={respondToGroupInviteAction} className="inline">
                      <input type="hidden" name="membership_id" value={m.id} />
                      <input type="hidden" name="status" value="joined" />
                      <button type="submit" className="btn small-btn">Join</button>
                    </form>
                    <form action={respondToGroupInviteAction} className="inline">
                      <input type="hidden" name="membership_id" value={m.id} />
                      <input type="hidden" name="status" value="declined" />
                      <button type="submit" className="btn ghost small-btn">Decline</button>
                    </form>
                  </span>
                </div>
              ))}
            </section>
          )}

          <section className="card">
            <div className="card-title"><h3>Your groups</h3><span className="micro-note">{groups.length}</span></div>
            {groups.length === 0 ? (
              <Empty symbol={"✳"} title="No groups yet." body="Start one with two or three colleagues you already consult informally." />
            ) : (
              groups.map((g: any) => (
                <a key={g.id} href={`/dashboard/consult/groups/${g.id}`} className="list-row" style={{ textDecoration: "none", color: "inherit" }}>
                  <span>
                    <strong>{g.name}</strong>
                    <small>{[g.purpose, g.cadence].filter(Boolean).join(" · ") || "Consultation group"}</small>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    {g.mine && <Status tone="neutral">You run it</Status>}
                    {!g.charter_body && <Status tone="warn">Needs a charter</Status>}
                  </span>
                </a>
              ))
            )}
          </section>

          <details className="card" open={groups.length === 0}>
            <summary style={{ cursor: "pointer" }}><strong>Start a group</strong></summary>
            <form action={createConsultationGroupAction} style={{ marginTop: 14 }}>
              <div className="fields">
                <label className="field">
                  Group name
                  <input name="name" required placeholder="e.g. Child trauma peer group" />
                </label>
                <label className="field">
                  How often you meet
                  <input name="cadence" placeholder="e.g. Monthly" />
                </label>
                <label className="field">
                  Format
                  <select name="meeting_format" defaultValue="">
                    <option value="">Not decided</option>
                    <option value="video">Video</option>
                    <option value="in_person">In person</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </label>
                <label className="field">
                  Purpose
                  <input name="purpose" placeholder="What the group is for" />
                </label>
                <label className="field full">
                  Charter
                  <textarea name="charter_body" rows={4} placeholder="Confidentiality, de-identification, consultation not supervision, no recording, how cases are presented." />
                  <small>You can write it after creating the group, but nobody can be invited or post until it exists.</small>
                </label>
              </div>
              <button type="submit" className="btn" style={{ marginTop: 12 }}>Create group</button>
            </form>
          </details>
        </div>
        <aside className="stack">
          <section className="card">
            <div className="eyebrow">From the Practice Library</div>
            <h3>PA-04 &middot; Group Charter</h3>
            <p className="small">A charter, member agreement, 90-minute agenda and consultation log for a peer group.</p>
            <a className="btn secondary small-btn" href="/dashboard/documents/PA-04">View PA-04</a>
          </section>
          <section className="card tint">
            <div className="eyebrow">Ground rules</div>
            <ul className="note-list" style={{ paddingLeft: 16, margin: 0 }}>
              <li>Members only. Nothing leaves the group.</li>
              <li>De-identified cases, always.</li>
              <li>Consultation, not supervision: the treating clinician decides.</li>
              <li>No automatic recording or transcription.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
