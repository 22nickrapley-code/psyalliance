import { createClient } from "@/lib/supabase/server";
import { createConsultationGroupAction, respondToGroupInviteAction } from "./actions";

// PsyA2 #63 (PA-04 closed peer consultation groups): "Members can create
// persistent closed peer groups." First-pass list page - create a group,
// see the ones you belong to, and respond to invitations waiting on you.
export default async function ConsultationGroupsPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const { data: memberships } = await supabase
    .from("consultation_group_members")
    .select("id, status, role, group:group_id(id, name, purpose, cadence, created_by)")
    .eq("profile_id", myself)
    .order("invited_at", { ascending: false });

  const { data: createdGroups } = await supabase
    .from("consultation_groups")
    .select("id, name, purpose, cadence")
    .eq("created_by", myself)
    .order("created_at", { ascending: false });

  const invitations = (memberships || []).filter((m: any) => m.status === "invited");
  const joinedMemberships = (memberships || []).filter((m: any) => m.status === "joined");
  const joinedGroupIds = new Set(joinedMemberships.map((m: any) => m.group?.id));
  // A group you created is already yours whether or not there's a separate
  // membership row for it (createConsultationGroup seeds one, but don't
  // assume) - de-duplicate so it isn't listed twice.
  const myGroups = [
    ...(createdGroups || []).map((g: any) => ({ ...g, iAmCreator: true })),
    ...joinedMemberships
      .filter((m: any) => !(createdGroups || []).some((g: any) => g.id === m.group?.id))
      .map((m: any) => ({ ...m.group, iAmCreator: false })),
  ];

  return (
    <div>
      <h1>Consultation groups</h1>
      <p className="muted">
        Closed peer groups (PA-04) - a smaller, persistent space for a set of colleagues to consult
        each other regularly, with their own charter and confidentiality expectations. Different from
        posting a one-off consultation to your trusted colleagues or the wider network.
      </p>
      {error && <div className="error-banner">{error}</div>}

      {invitations.length > 0 && (
        <div className="card">
          <h2>Invitations waiting on you ({invitations.length})</h2>
          {invitations.map((m: any) => (
            <div key={m.id} className="person-row">
              <span className="person-row-info">
                <strong>{m.group?.name}</strong>
                {m.group?.purpose ? ` - ${m.group.purpose}` : ""}
              </span>
              <span className="person-row-actions">
                <form action={respondToGroupInviteAction}>
                  <input type="hidden" name="membership_id" value={m.id} />
                  <input type="hidden" name="status" value="joined" />
                  <button type="submit">Join</button>
                </form>
                <form action={respondToGroupInviteAction}>
                  <input type="hidden" name="membership_id" value={m.id} />
                  <input type="hidden" name="status" value="declined" />
                  <button type="submit" className="secondary">Decline</button>
                </form>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Create a consultation group</h2>
        <form action={createConsultationGroupAction}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="name">Group name</label>
              <input id="name" name="name" type="text" placeholder="Child trauma peer group" required />
            </div>
            <div className="field">
              <label htmlFor="cadence">Cadence</label>
              <input id="cadence" name="cadence" type="text" placeholder="Monthly" />
            </div>
            <div className="field">
              <label htmlFor="meeting_format">Meeting format</label>
              <select id="meeting_format" name="meeting_format" defaultValue="">
                <option value="">-</option>
                <option value="in_person">In person</option>
                <option value="video">Video</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="purpose">Purpose</label>
            <input id="purpose" name="purpose" type="text" placeholder="What this group is for" />
          </div>
          <div className="field">
            <label htmlFor="charter_body">Charter (ground rules, confidentiality expectations - optional, can add later)</label>
            <textarea id="charter_body" name="charter_body" rows={2} />
          </div>
          <button type="submit">Create group</button>
        </form>
      </div>

      <div className="card">
        <h2>My groups ({myGroups.length})</h2>
        {myGroups.map((g: any) => (
          <div key={g.id} className="person-row">
            <span className="person-row-info">
              <a href={`/dashboard/consult/groups/${g.id}`} className="person-link">{g.name}</a>
              {g.purpose ? ` - ${g.purpose}` : ""}
              {g.iAmCreator && <span className="tag" style={{ marginLeft: "0.4rem" }}>Creator</span>}
            </span>
          </div>
        ))}
        {myGroups.length === 0 && <p className="muted">You're not in any consultation groups yet.</p>}
      </div>
    </div>
  );
}
