import type { Match } from "@/lib/match-engine";
import { PageHead, Empty, Status, PersonAvatar, MatchCard } from "../_components/ui";
import { respondToConnection, sendConnectionRequest, saveClinicianAction, removeSavedClinicianAction } from "./actions";
import { professionFor, professionLabel } from "@/lib/profession";

// Network (Product Spec v1): your group practice, built from people you
// choose and work you've actually done together.

export type Person = {
  id: string;
  name: string;
  qualification: string | null;
  city: string | null;
  state: string | null;
  licenceStates: string[];
  topFocus: string[];
  availability: string;
  fresh: boolean;
  confirmedDaysAgo: number | null;
  psypact: boolean;
  avatarUrl: string | null;
  relationship: "trusted" | "worked_with" | "saved" | "pending_out" | "pending_in" | "none";
  saved: boolean;
};

export type NetworkTab = "directory" | "trusted" | "saved" | "worked" | "suggested";

const TABS: [NetworkTab, string][] = [
  ["directory", "Directory"],
  ["trusted", "Trusted colleagues"],
  ["worked", "Worked with before"],
  ["saved", "Saved"],
  ["suggested", "Suggested for you"],
];

const REL_LABEL: Record<Person["relationship"], string> = {
  trusted: "Trusted colleague",
  worked_with: "Worked with before",
  saved: "Saved",
  pending_out: "Invitation sent",
  pending_in: "Wants to connect",
  none: "",
};

function PersonCard({ p }: { p: Person }) {
  const where = [p.city, p.state].filter(Boolean).join(", ");
  return (
    <div className="mini-person">
      <PersonAvatar name={p.name} url={p.avatarUrl} />
      <div className="content">
        <div className="row between">
          <h3><a href={`/dashboard/people/${p.id}`}>{p.name}</a></h3>
          {p.fresh ? <Status>{p.availability}</Status> : <Status tone="neutral">{p.availability}</Status>}
        </div>
        <p>
          {professionLabel(professionFor(p.qualification))}
          {where ? ` · ${where}` : ""}
        </p>
        <ul className="reasons">
          {p.relationship !== "none" && <li>{REL_LABEL[p.relationship]}</li>}
          {p.licenceStates.length > 0 && <li>Licence on file: {p.licenceStates.join(", ")}</li>}
          {p.psypact && <li>PSYPACT</li>}
          {p.topFocus.map((f) => <li key={f}>{f}</li>)}
          <li>{p.confirmedDaysAgo === null ? "Availability not confirmed" : p.confirmedDaysAgo === 0 ? "Confirmed today" : `Confirmed ${p.confirmedDaysAgo} day${p.confirmedDaysAgo === 1 ? "" : "s"} ago`}</li>
        </ul>
        <div className="actions">
          <a className="btn secondary small-btn" href={`/dashboard/people/${p.id}`}>View profile</a>
          <a className="btn ghost small-btn" href={`/dashboard/refer/new?state=${p.state || ""}`}>Refer</a>
          <form action={p.saved ? removeSavedClinicianAction : saveClinicianAction} className="inline">
            <input type="hidden" name="clinician_id" value={p.id} />
            <button type="submit" className="btn ghost small-btn">{p.saved ? "Saved ✓" : "Save"}</button>
          </form>
          {p.relationship === "none" || p.relationship === "saved" || p.relationship === "worked_with" ? (
            <form action={sendConnectionRequest} className="inline">
              <input type="hidden" name="addressee_id" value={p.id} />
              <input type="hidden" name="tier" value="trusted_colleague" />
              <button type="submit" className="btn ghost small-btn">Invite to trusted</button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NetworkView({
  tab,
  people,
  suggested,
  suggestedAvatars,
  invitations,
  sentCount,
  filters,
  focusOptions,
  moreOptions,
  states,
  counts,
}: {
  tab: NetworkTab;
  people: Person[];
  suggested: Match[];
  suggestedAvatars: Record<string, string | null>;
  invitations: { id: number; name: string; profileId: string }[];
  sentCount: number;
  filters: { q: string; focus: string; state: string; available: boolean; profession: string; insurance?: string; age?: string; language?: string; modality?: string; session?: string; psypact?: boolean };
  focusOptions: string[];
  moreOptions?: { insurance: string[]; age: string[]; language: string[]; modality: string[]; session: string[] };
  states: { code: string; name: string }[];
  counts: Record<NetworkTab, number>;
}) {
  return (
    <>
      <PageHead
        eyebrow="Your professional circle"
        title="Find the right colleague."
        lead="Search by relevant professional facts, availability and your existing relationships."
      />
      <div className="split">
        <div className="stack">
          <form method="get" action="/dashboard/network" className="stack" style={{ gap: 10 }}>
            <input type="hidden" name="tab" value={tab === "suggested" ? "directory" : tab} />
            <div className="searchbar">
              <span className="magnify" aria-hidden="true">&#8981;</span>
              <input name="q" defaultValue={filters.q} placeholder="Search name or specialty" aria-label="Search name or specialty" />
              <button type="submit" className="btn small-btn">Search</button>
            </div>
            <div className="fields four">
              <label className="field">
                Specialty
                <select name="focus" defaultValue={filters.focus}>
                  <option value="">All specialties</option>
                  {focusOptions.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <label className="field">
                Licensed in
                <select name="state" defaultValue={filters.state}>
                  <option value="">All states</option>
                  {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              </label>
              <label className="field">
                Profession
                <select name="profession" defaultValue={filters.profession}>
                  <option value="">Psychologists and psychiatrists</option>
                  <option value="psychologist">Psychologists</option>
                  <option value="psychiatrist">Psychiatrists</option>
                </select>
              </label>
              <label className="checkline" style={{ alignSelf: "end", paddingBottom: 12 }}>
                <input type="checkbox" name="available" value="1" defaultChecked={filters.available} /> Taking referrals now
              </label>
            </div>
            {moreOptions && (
              <details open={!!(filters.insurance || filters.age || filters.language || filters.modality || filters.session || filters.psypact)}>
                <summary className="small" style={{ cursor: "pointer", fontWeight: 650 }}>More filters</summary>
                <div className="fields four" style={{ marginTop: 10 }}>
                  {(
                    [
                      ["insurance", "Insurance", moreOptions.insurance, filters.insurance],
                      ["age", "Age group", moreOptions.age, filters.age],
                      ["language", "Language", moreOptions.language, filters.language],
                      ["modality", "Modality", moreOptions.modality, filters.modality],
                      ["session", "Session type", moreOptions.session, filters.session],
                    ] as [string, string, string[], string | undefined][]
                  ).map(([name, label, opts, val]) => (
                    <label key={name} className="field">
                      {label}
                      <select name={name} defaultValue={val || ""}>
                        <option value="">Any</option>
                        {opts.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </label>
                  ))}
                  <label className="checkline" style={{ alignSelf: "end", paddingBottom: 12 }}>
                    <input type="checkbox" name="psypact" value="1" defaultChecked={filters.psypact} /> PSYPACT
                  </label>
                </div>
                <button type="submit" className="btn secondary small-btn" style={{ marginTop: 10 }}>Apply filters</button>
              </details>
            )}
          </form>

          <nav className="tabs" aria-label="Relationship">
            {TABS.map(([k, label]) => (
              <a key={k} className={`tab${tab === k ? " active" : ""}`} href={`/dashboard/network?tab=${k}`}>
                {label} {k !== "suggested" && <span className="micro-note">({counts[k]})</span>}
              </a>
            ))}
          </nav>

          {tab === "suggested" ? (
            suggested.length === 0 ? (
              <Empty title="No suggestions yet." body="Suggestions come from your specialties, your state and who's active. Complete your profile to get better ones." action={<a className="btn secondary small-btn" href="/dashboard/profile">Complete profile</a>} />
            ) : (
              suggested.map((m) => (
                <MatchCard
                  key={m.profileId}
                  m={m}
                  avatarUrl={suggestedAvatars[m.profileId]}
                  actions={
                    <>
                      <a className="btn secondary small-btn" href={`/dashboard/people/${m.profileId}`}>View profile</a>
                      <form action={sendConnectionRequest} className="inline">
                        <input type="hidden" name="addressee_id" value={m.profileId} />
                        <input type="hidden" name="tier" value="trusted_colleague" />
                        <button type="submit" className="btn ghost small-btn">Invite to trusted</button>
                      </form>
                      <form action={saveClinicianAction} className="inline">
                        <input type="hidden" name="clinician_id" value={m.profileId} />
                        <button type="submit" className="btn ghost small-btn">Save</button>
                      </form>
                    </>
                  }
                />
              ))
            )
          ) : people.length === 0 ? (
            <Empty
              title={tab === "directory" ? "No one matches these filters." : "No one here yet."}
              body={
                tab === "trusted"
                  ? "Trusted colleagues are people you'd call your own group-practice colleagues. Invite people you already work with."
                  : tab === "saved"
                    ? "Save clinicians you'd refer to or call on. Saving is private; they aren't told."
                    : tab === "worked"
                      ? "Colleagues appear here automatically after a completed referral, cover arrangement or consultation together."
                      : "Try removing a filter. Only verified members with an active licence on record are listed."
              }
            />
          ) : (
            people.map((p) => <PersonCard key={p.id} p={p} />)
          )}
        </div>

        <aside className="stack">
          <section className="card">
            <div className="card-title">
              <h3>Relationship invitations</h3>
              {invitations.length > 0 && <Status tone="warn">{invitations.length} pending</Status>}
            </div>
            {invitations.length === 0 ? (
              <p className="small">No invitations waiting.{sentCount ? ` ${sentCount} you sent ${sentCount === 1 ? "is" : "are"} awaiting a reply.` : ""}</p>
            ) : (
              invitations.map((i) => (
                <div key={i.id} className="item">
                  <strong><a href={`/dashboard/people/${i.profileId}`}>{i.name}</a></strong>
                  <p>Invited you to their trusted circle.</p>
                  <div className="row" style={{ marginTop: 8 }}>
                    <form action={respondToConnection} className="inline">
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="decision" value="accepted" />
                      <button type="submit" className="btn small-btn">Accept</button>
                    </form>
                    <form action={respondToConnection} className="inline">
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="decision" value="declined" />
                      <button type="submit" className="btn ghost small-btn">Decline</button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </section>
          <section className="card tint">
            <div className="eyebrow">How relationships work</div>
            <h3>A circle you control.</h3>
            <ul className="note-list" style={{ paddingLeft: 16, margin: 0 }}>
              <li><b>Trusted colleagues</b> are mutual, like colleagues in a group practice. They rank first in every match.</li>
              <li><b>Worked with before</b> builds itself from completed referrals, cover and consults.</li>
              <li><b>Saved</b> is a private bookmark for people you&rsquo;d call on. They aren&rsquo;t told.</li>
              <li><b>Suggested</b> are people worth bringing into your circle.</li>
              <li><b>Exclude</b> privately removes someone from all your suggestions. Use <b>Report</b> on a profile for anything that needs an admin.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
