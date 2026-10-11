import { PageHead, Empty, Status, PersonAvatar, Banner } from "../_components/ui";
import { InviteBox } from "../_components/invite-box";
import type { InviteInfo } from "@/lib/invite";
import { addTrustedAction } from "../network/actions";
import { roleLabel } from "@/lib/profession";
import { US_STATES } from "@/lib/us-states";

// Clinicians: search everyone in the verified network. Opens on everyone,
// with no filters set; trusted colleagues and people you've worked with
// come first. One action on every card: Add as Trusted Colleague.

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
  relationship: "trusted" | "worked_with" | "none";
};

export type Filters = {
  q: string;
  focus: string;
  state: string;
  available: boolean;
  profession: string;
  insurance?: string;
  age?: string;
  language?: string;
  modality?: string;
  session?: string;
  psypact?: boolean;
};

const REL_LABEL: Record<Person["relationship"], string> = {
  trusted: "Trusted colleague",
  worked_with: "Worked with before",
  none: "",
};

const stateName = (code: string) => US_STATES.find((s) => s.code === code)?.name || code;

function confirmedLabel(days: number | null) {
  if (days === null) return "Availability not confirmed";
  if (days === 0) return "Confirmed today";
  if (days === 1) return "Confirmed yesterday";
  return `Confirmed ${days} days ago`;
}

export function TrustButton({ id, trusted, back, small = true }: { id: string; trusted: boolean; back: string; small?: boolean }) {
  if (trusted) return <span className="done trusted-done">Trusted colleague &#10003;</span>;
  return (
    <form action={addTrustedAction} className="inline">
      <input type="hidden" name="colleague_id" value={id} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" className={`btn secondary${small ? " small-btn" : ""}`}>Add as Trusted Colleague</button>
    </form>
  );
}

export function PersonCard({ p, back }: { p: Person; back: string }) {
  const where = [p.city, p.state].filter(Boolean).join(", ");
  const license =
    p.licenceStates.length === 0
      ? null
      : p.licenceStates.length === 1
        ? `${stateName(p.licenceStates[0])} license reviewed`
        : `Reviewed licenses: ${p.licenceStates.join(", ")}`;
  const facts = [license, p.topFocus.join(" · "), (p.modalities || [])[0], p.psypact ? "PSYPACT" : null].filter(Boolean) as string[];
  const paused = /^Paused/.test(p.availability);
  return (
    <article className={`person-card${p.relationship === "trusted" ? " is-trusted" : ""}`}>
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
          <a className="text-arrow" href={`/dashboard/people/${p.id}`}>View profile &rarr;</a>
          <TrustButton id={p.id} trusted={p.relationship === "trusted"} back={back} />
        </div>
      </div>
    </article>
  );
}

export function cliniciansHref(filters: Partial<Filters>, page = 1) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === true) q.set(k, "1");
    else if (typeof v === "string" && v) q.set(k, v);
  }
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return `/dashboard/clinicians${s ? `?${s}` : ""}`;
}

export function CliniciansView({
  people,
  total = people.length,
  page = 1,
  pageSize = 20,
  filters,
  focusOptions,
  moreOptions,
  states,
  networkSize = 1,
  note,
  error,
  invite,
}: {
  people: Person[];
  total?: number;
  page?: number;
  pageSize?: number;
  filters: Filters;
  focusOptions: string[];
  moreOptions?: { insurance: string[]; age: string[]; language: string[]; modality: string[]; session: string[] };
  states: { code: string; name: string }[];
  networkSize?: number;
  note?: string | null;
  error?: string | null;
  invite?: InviteInfo;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const more = !!(filters.insurance || filters.age || filters.language || filters.modality || filters.session || filters.psypact);
  const filtered = !!(filters.q || filters.focus || filters.state || filters.available || filters.profession || more);
  const scope = [filters.focus, filters.state ? stateName(filters.state) : null].filter(Boolean).join(" in ");
  const here = cliniciansHref(filters, page);

  return (
    <>
      <PageHead
        eyebrow="Workspace"
        title="Clinicians"
        lead="Everyone in the verified network. Search by name, specialty, state or availability."
        actions={<a className="btn secondary" href="/dashboard/network">Your network</a>}
      />
      <Banner ok={note} error={error} />
      <form method="get" action="/dashboard/clinicians">
        <div className="searchbar">
          <span className="magnify" aria-hidden="true">&#8981;</span>
          <input name="q" defaultValue={filters.q} placeholder="Search name, specialty, service or language" aria-label="Search name, specialty, service or language" />
          <span className="micro-note" style={{ whiteSpace: "nowrap", paddingRight: 6 }}>{`${total.toLocaleString()} shown`}</span>
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
          <details style={{ marginTop: 12 }} open={more}>
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
          {filtered && <a className="plain-button small" href="/dashboard/clinicians">Clear filters</a>}
        </div>
      </form>

      {total > 0 && (
        <div className="results-line" style={{ marginTop: 20 }}>
          <span>
            <b>{total.toLocaleString()}</b> {total === 1 ? "clinician" : "clinicians"}
            {scope ? ` · ${scope}` : filtered ? " match" : ""}
          </span>
          {pages > 1 && <span>Showing {from}&ndash;{to}</span>}
        </div>
      )}
      {total > 0 && <p className="why-line">Your trusted colleagues and people you&rsquo;ve worked with come first, then members who confirmed their availability in the last 30 days.</p>}

      {people.length === 0 && networkSize === 0 ? (
        <div style={{ marginTop: 16 }}>
          <Empty
            symbol={"◎"}
            title="The founding circle is forming."
            body="Verified members appear here as they join, a few states at a time. Know a psychologist or psychiatrist who should be here? Send them your invitation link."
            action={<a className="btn secondary small-btn" href={invite ? "#invite" : "/dashboard/invite"}>Invite a colleague</a>}
          />
        </div>
      ) : people.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <Empty
            title="No one matches these filters."
            body="Try removing a filter. Only verified members with an active license on record are listed."
            action={<a className="btn secondary small-btn" href="/dashboard/clinicians">Clear filters</a>}
          />
        </div>
      ) : (
        <>
          {people.map((p) => <PersonCard key={p.id} p={p} back={here} />)}
          {pages > 1 && (
            <nav className="pager" aria-label="Pages">
              {page > 1 ? <a className="btn secondary small-btn" href={cliniciansHref(filters, page - 1)}>&larr; Previous</a> : <span />}
              <span>Page {page} of {pages}</span>
              {page < pages ? <a className="btn secondary small-btn" href={cliniciansHref(filters, page + 1)}>Next &rarr;</a> : <span />}
            </nav>
          )}
          <p className="micro-note" style={{ marginTop: 16 }}>
            Listed members are verified, with an active license reviewed against the state board. Availability is set by each member; fit for a particular client is always your clinical judgment.
          </p>
        </>
      )}
      {invite && (
        <InviteBox
          info={invite}
          title={people.length === 0 ? "Not here yet? Invite them." : "Can't find someone? Invite them."}
        />
      )}
    </>
  );
}
