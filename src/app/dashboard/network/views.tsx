import type { Match } from "@/lib/match-engine";
import { PageHead, Empty, Status, PersonAvatar, MatchCard } from "../_components/ui";
import { respondToConnection, sendConnectionRequest, saveClinicianAction, removeSavedClinicianAction } from "./actions";
import { roleLabel } from "@/lib/profession";
import { US_STATES } from "@/lib/us-states";
import { JOIN_URL } from "@/lib/env";

// Network (Product Spec v1): your group practice, built from people you
// choose and work you've actually done together. Layout and card follow
// the design concept: facts on one quiet line, relationship and freshness
// on the next, two clear actions.

export type Person = {
  id: string;
  name: string;
  qualification: string | null;
  city: string | null;
  state: string | null;
  licenceStates: string[];
  topFocus: string[];
  modalities?: string[];
  availability: string;
  fresh: boolean;
  confirmedDaysAgo: number | null;
  psypact: boolean;
  avatarUrl: string | null;
  relationship: "trusted" | "worked_with" | "saved" | "pending_out" | "pending_in" | "none";
  saved: boolean;
};

export type Invitation = { id: number; name: string; profileId: string; where: string; avatarUrl: string | null };

export type NetworkTab = "directory" | "trusted" | "saved" | "worked" | "suggested";

const TABS: [NetworkTab, string][] = [
  ["directory", "Directory"],
  ["trusted", "Trusted colleagues"],
  ["saved", "Saved"],
  ["worked", "Worked with before"],
  ["suggested", "Suggested"],
];

const REL_LABEL: Record<Person["relationship"], string> = {
  trusted: "Trusted colleague",
  worked_with: "Worked with before",
  saved: "Saved clinician",
  pending_out: "Invitation sent",
  pending_in: "Wants to connect",
  none: "",
};

const stateName = (code: string) => US_STATES.find((s) => s.code === code)?.name || code;

function confirmedLabel(days: number | null) {
  if (days === null) return "Availability not confirmed";
  if (days === 0) return "Confirmed today";
  if (days === 1) return "Confirmed yesterday";
  return `Confirmed ${days} days ago`;
}

function PersonCard({ p }: { p: Person }) {
  const where = [p.city, p.state].filter(Boolean).join(", ");
  const licence =
    p.licenceStates.length === 0
      ? null
      : p.licenceStates.length === 1
        ? `${stateName(p.licenceStates[0])} licence on file`
        : `Licences on file: ${p.licenceStates.join(", ")}`;
  const facts = [licence, p.topFocus.join(" · "), (p.modalities || [])[0], p.psypact ? "PSYPACT" : null].filter(Boolean) as string[];
  const paused = /^Paused/.test(p.availability);
  return (
    <article className="person-card">
      <PersonAvatar name={p.name} url={p.avatarUrl} />
      <div className="content">
        <div className="top">
          <div>
            <h3><a href={`/dashboard/people/${p.id}`}>{p.name}</a></h3>
            <p className="role">{roleLabel(p.qualification)}{where ? ` · ${where}` : ""}</p>
          </div>
          <Status tone={p.fresh ? "" : paused ? "warn" : "neutral"}>{p.availability}</Status>
        </div>
        <p className="facts">{facts.map((f) => <span key={f}>{f}</span>)}</p>
        <p className="meta">
          {confirmedLabel(p.confirmedDaysAgo)}
          {p.relationship !== "none" && <> &middot; <span className="rel">{REL_LABEL[p.relationship]}</span></>}
        </p>
        <div className="actions">
          <a className="text-arrow" href={`/dashboard/people/${p.id}`}>View profile &#8599;</a>
          <form action={p.saved ? removeSavedClinicianAction : saveClinicianAction} className="inline">
            <input type="hidden" name="clinician_id" value={p.id} />
            <button type="submit" className="btn secondary small-btn">{p.saved ? "Saved ✓" : "Save clinician"}</button>
          </form>
          {p.relationship === "trusted" ? (
            <span className="done">Trusted &#10003;</span>
          ) : p.relationship === "pending_out" ? (
            <span className="done">Invitation sent</span>
          ) : p.relationship === "pending_in" ? (
            <a className="btn ghost small-btn" href="#invitations">Review invitation</a>
          ) : (
            <form action={sendConnectionRequest} className="inline">
              <input type="hidden" name="addressee_id" value={p.id} />
              <input type="hidden" name="tier" value="trusted_colleague" />
              <button type="submit" className="btn ghost small-btn">Invite to trusted</button>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}

function pageHref(filters: Record<string, string | boolean | undefined>, tab: NetworkTab, page: number) {
  const q = new URLSearchParams();
  q.set("tab", tab);
  for (const [k, v] of Object.entries(filters)) {
    if (v === true) q.set(k, "1");
    else if (typeof v === "string" && v) q.set(k, v);
  }
  if (page > 1) q.set("page", String(page));
  return `/dashboard/network?${q.toString()}`;
}

export function NetworkView({
  tab,
  people,
  total = people.length,
  page = 1,
  pageSize = 20,
  suggested,
  suggestedAvatars,
  invitations,
  sentCount,
  filters,
  focusOptions,
  moreOptions,
  states,
  counts,
  networkSize = 1,
}: {
  tab: NetworkTab;
  people: Person[];
  total?: number;
  page?: number;
  pageSize?: number;
  suggested: Match[];
  suggestedAvatars: Record<string, string | null>;
  invitations: Invitation[];
  sentCount: number;
  filters: { q: string; focus: string; state: string; available: boolean; profession: string; insurance?: string; age?: string; language?: string; modality?: string; session?: string; psypact?: boolean };
  focusOptions: string[];
  moreOptions?: { insurance: string[]; age: string[]; language: string[]; modality: string[]; session: string[] };
  states: { code: string; name: string }[];
  counts: Record<NetworkTab, number>;
  networkSize?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const filtered = !!(filters.q || filters.focus || filters.state || filters.available || filters.profession || filters.insurance || filters.age || filters.language || filters.modality || filters.session || filters.psypact);
  const scope = [filters.focus, filters.state ? stateName(filters.state) : null].filter(Boolean).join(" in ");
  const inviteHref = `mailto:?subject=${encodeURIComponent("Join me on PsyAlliance")}&body=${encodeURIComponent(`I use PsyAlliance for cover, referrals and consultation with colleagues I trust. You can ask to join here: ${JOIN_URL}`)}`;

  return (
    <>
      <PageHead
        eyebrow="Your professional circle"
        title="Find the right colleague."
        lead="Search by relevant professional facts, availability and your existing relationships."
        actions={<a className="btn" href={inviteHref}>Invite a colleague</a>}
      />
      <div className="split">
        <div>
          <form method="get" action="/dashboard/network">
            <input type="hidden" name="tab" value={tab === "suggested" ? "directory" : tab} />
            <div className="searchbar">
              <span className="magnify" aria-hidden="true">&#8981;</span>
              <input name="q" defaultValue={filters.q} placeholder="Search name, specialty, service or language" aria-label="Search name, specialty, service or language" />
              <span className="micro-note" style={{ whiteSpace: "nowrap", paddingRight: 6 }}>{tab === "suggested" ? "" : `${total.toLocaleString()} shown`}</span>
            </div>
            <div className="filter-grid" style={{ marginTop: 14 }}>
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
              <label className="checkline" style={{ paddingBottom: 12 }}>
                <input type="checkbox" name="available" value="1" defaultChecked={filters.available} /> Available now
              </label>
            </div>
            {moreOptions && (
              <details style={{ marginTop: 12 }} open={!!(filters.insurance || filters.age || filters.language || filters.modality || filters.session || filters.psypact)}>
                <summary className="small" style={{ cursor: "pointer", fontWeight: 650, color: "var(--forest)" }}>More filters</summary>
                <div className="fields three" style={{ marginTop: 12 }}>
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
                    <input type="checkbox" name="psypact" value="1" defaultChecked={filters.psypact} /> PSYPACT telehealth
                  </label>
                </div>
              </details>
            )}
            <div className="row" style={{ marginTop: 14, gap: 10 }}>
              <button type="submit" className="btn small-btn">Search</button>
              {filtered && <a className="plain-button small" href={`/dashboard/network?tab=${tab}`}>Clear filters</a>}
            </div>
          </form>

          <nav className="tabs" aria-label="Relationship" style={{ marginTop: 20 }}>
            {TABS.map(([k, label]) => (
              <a key={k} className={`tab${tab === k ? " active" : ""}`} href={`/dashboard/network?tab=${k}`}>
                {label}
                {k !== "suggested" && counts[k] > 0 && <span className="micro-note"> {counts[k].toLocaleString()}</span>}
              </a>
            ))}
          </nav>

          {tab !== "suggested" && total > 0 && (
            <div className="results-line">
              <span>
                <b>{total.toLocaleString()}</b> {total === 1 ? "colleague" : "colleagues"}
                {scope ? ` · ${scope}` : filtered ? " match" : ""}
              </span>
              {pages > 1 && <span>Showing {from}&ndash;{to}</span>}
            </div>
          )}

          {tab === "suggested" ? (
            suggested.length === 0 ? (
              <Empty title="No suggestions yet." body="Suggestions come from your specialties, your state and who's active. Complete your profile to get better ones." action={<a className="btn secondary small-btn" href="/dashboard/profile">Complete profile</a>} />
            ) : (
              <div style={{ marginTop: 16 }}>
                {suggested.map((m) => (
                  <MatchCard
                    key={m.profileId}
                    m={m}
                    avatarUrl={suggestedAvatars[m.profileId]}
                    actions={
                      <>
                        <a className="text-arrow" href={`/dashboard/people/${m.profileId}`}>View profile &#8599;</a>
                        <form action={saveClinicianAction} className="inline">
                          <input type="hidden" name="clinician_id" value={m.profileId} />
                          <button type="submit" className="btn secondary small-btn">Save clinician</button>
                        </form>
                        <form action={sendConnectionRequest} className="inline">
                          <input type="hidden" name="addressee_id" value={m.profileId} />
                          <input type="hidden" name="tier" value="trusted_colleague" />
                          <button type="submit" className="btn ghost small-btn">Invite to trusted</button>
                        </form>
                      </>
                    }
                  />
                ))}
              </div>
            )
          ) : people.length === 0 && networkSize === 0 ? (
            <div style={{ marginTop: 16 }}>
              <Empty
                symbol={"◎"}
                title="The founding circle is forming."
                body="Verified members appear here as they join, a few states at a time. Know a psychologist or psychiatrist who should be here? Invite them to ask to join."
                action={<a className="btn secondary small-btn" href={inviteHref}>Invite a colleague</a>}
              />
            </div>
          ) : people.length === 0 ? (
            <div style={{ marginTop: 16 }}>
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
                action={filtered ? <a className="btn secondary small-btn" href={`/dashboard/network?tab=${tab}`}>Clear filters</a> : undefined}
              />
            </div>
          ) : (
            <>
              {people.map((p) => <PersonCard key={p.id} p={p} />)}
              {pages > 1 && (
                <nav className="pager" aria-label="Pages">
                  {page > 1 ? <a className="btn secondary small-btn" href={pageHref(filters, tab, page - 1)}>&larr; Previous</a> : <span />}
                  <span>Page {page} of {pages}</span>
                  {page < pages ? <a className="btn secondary small-btn" href={pageHref(filters, tab, page + 1)}>Next &rarr;</a> : <span />}
                </nav>
              )}
              <p className="micro-note" style={{ marginTop: 16 }}>
                Listed members are verified, with an active licence reviewed against the state board. Availability is set by each member; fit for a particular patient is always your clinical judgement.
              </p>
            </>
          )}
        </div>

        <aside className="stack">
          <section className="card tint" id="invitations">
            <div className="card-title">
              <h3>Relationship invitations</h3>
              {invitations.length > 0 && <Status tone="warn">{invitations.length} pending</Status>}
            </div>
            {invitations.length === 0 ? (
              <p className="small" style={{ margin: 0 }}>No invitations waiting.{sentCount ? ` ${sentCount} you sent ${sentCount === 1 ? "is" : "are"} awaiting a reply.` : ""}</p>
            ) : (
              invitations.map((i) => (
                <div key={i.id} className="invite-row">
                  <PersonAvatar name={i.name} url={i.avatarUrl} />
                  <div>
                    <strong><a href={`/dashboard/people/${i.profileId}`}>{i.name}</a></strong>
                    <p>{i.where ? `${i.where} · ` : ""}Invited you to connect as a trusted colleague.</p>
                    <div className="row" style={{ gap: 8 }}>
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
                </div>
              ))
            )}
          </section>
          <section className="card">
            <div className="eyebrow">How relationships work</div>
            <h3 className="serif-title" style={{ fontSize: 24 }}>A circle you control.</h3>
            <p className="small" style={{ marginBottom: 0 }}>
              <b style={{ color: "var(--ink)" }}>Trusted</b> is a reciprocal relationship and ranks first in every match. <b style={{ color: "var(--ink)" }}>Saved</b> is a private bookmark. <b style={{ color: "var(--ink)" }}>Worked with before</b> builds itself from completed referrals, cover and consults. Exclude or block anyone from their profile; they are never told.
            </p>
          </section>
          <section className="card">
            <div className="eyebrow">Your circle</div>
            <ul className="count-list" style={{ marginTop: 10 }}>
              <li><a href="/dashboard/network?tab=trusted">Trusted</a><b>{counts.trusted}</b></li>
              <li><a href="/dashboard/network?tab=saved">Saved</a><b>{counts.saved}</b></li>
              <li><a href="/dashboard/network?tab=worked">Worked with before</a><b>{counts.worked}</b></li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
