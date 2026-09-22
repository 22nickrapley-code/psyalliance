"use client";

import { useMemo, useState } from "react";
import Avatar from "../avatar";
import { professionLabel, type Profession } from "@/lib/profession";
import UsStateDatalist from "@/components/us-state-datalist";

export type DirectoryEntry = {
  id: string;
  name: string;
  credentialPrefix: string | null;
  profession: Profession;
  qualificationLevel: string;
  city: string | null;
  state: string | null;
  specialisms: string[];
  psypact: boolean;
  avatarUrl: string | null;
  tier: "partner" | "trusted_colleague" | "bench" | "recommended" | "none";
  connectionStatus: "accepted" | "pending" | null;
  saved: boolean;
};

const PAGE_SIZE = 15;
const TIER_ORDER: Record<string, number> = { partner: 0, trusted_colleague: 0, bench: 1, recommended: 2, none: 3 };

function ProfessionTag({ profession }: { profession: Profession }) {
  return (
    <span className={`tag${profession === "psychiatrist" ? " psychiatrist" : ""}`}>
      {professionLabel(profession)}
    </span>
  );
}

function TierTag({ tier }: { tier: DirectoryEntry["tier"] }) {
  if (tier === "none") return <span className="tag tier-none">Not yet connected</span>;
  const label = tier === "partner" || tier === "trusted_colleague" ? "Trusted Colleague" : tier === "bench" ? "Bench" : "Suggested for you";
  return <span className={`tag tier-${tier}`}>{label}</span>;
}

// The "Full verified directory" browser - every filter (name, state,
// specialism, connection status, profession, PSYPACT) applies instantly in
// local state with no page reload, condensed to 2-3 rows per profile (top
// two specialisms, "+N more"), and paginated client-side rather than one
// long scroll - per Nick's note that the old version felt like "too much to
// take in" and needed to page "like LinkedIn" instead.
export default function DirectoryBrowser({
  people,
  specialismOptions,
  sendConnectionRequest,
  startConversation,
  saveClinicianAction,
  removeSavedClinicianAction,
}: {
  people: DirectoryEntry[];
  specialismOptions: string[];
  sendConnectionRequest: (formData: FormData) => Promise<void>;
  startConversation: (formData: FormData) => Promise<void>;
  saveClinicianAction: (formData: FormData) => Promise<void>;
  removeSavedClinicianAction: (formData: FormData) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [specialism, setSpecialism] = useState("");
  const [degree, setDegree] = useState("all");
  const [profession, setProfession] = useState("");
  const [psypactOnly, setPsypactOnly] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const st = state.trim().toUpperCase();
    return people
      .filter((p) => !qq || p.name.toLowerCase().includes(qq))
      .filter((p) => !st || p.state === st)
      .filter((p) => !specialism || p.specialisms.includes(specialism))
      .filter((p) => degree === "all" || p.tier === degree)
      .filter((p) => !profession || p.profession === profession)
      .filter((p) => !psypactOnly || p.psypact)
      .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.localeCompare(b.name));
  }, [people, q, state, specialism, degree, profession, psypactOnly]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function updateFilter<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  const hasAnyFilter = q || state || specialism || degree !== "all" || profession || psypactOnly;

  return (
    <div>
      <div className="field-row" style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div className="field">
          <label htmlFor="dir-q">Name</label>
          <input id="dir-q" type="text" value={q} onChange={(e) => updateFilter(setQ)(e.target.value)} placeholder="Search by name" />
        </div>
        <div className="field" style={{ maxWidth: 100 }}>
          <label htmlFor="dir-state">State</label>
          <input
            id="dir-state"
            type="text"
            maxLength={24}
            value={state}
            onChange={(e) => updateFilter(setState)(e.target.value)}
            placeholder="TX"
            list="us-states"
            autoComplete="off"
          />
          <UsStateDatalist />
        </div>
        <div className="field">
          <label htmlFor="dir-specialism">Specialism</label>
          <select id="dir-specialism" value={specialism} onChange={(e) => updateFilter(setSpecialism)(e.target.value)}>
            <option value="">Any</option>
            {specialismOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dir-degree">Connection status</label>
          <select id="dir-degree" value={degree} onChange={(e) => updateFilter(setDegree)(e.target.value)}>
            <option value="all">All</option>
            <option value="trusted_colleague">Trusted Colleague</option>
            <option value="bench">Bench</option>
            <option value="recommended">Suggested for you</option>
            <option value="none">Not yet connected</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="dir-profession">Profession</label>
          <select id="dir-profession" value={profession} onChange={(e) => updateFilter(setProfession)(e.target.value)}>
            <option value="">Any</option>
            <option value="psychologist">Psychologist</option>
            <option value="psychiatrist">Psychiatrist</option>
          </select>
        </div>
        <div className="field checkbox-row" style={{ flex: "0 0 auto", alignSelf: "center" }}>
          <input id="dir-psypact" type="checkbox" checked={psypactOnly} onChange={(e) => updateFilter(setPsypactOnly)(e.target.checked)} />
          <label htmlFor="dir-psypact" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
            PSYPACT only
          </label>
        </div>
        {hasAnyFilter && (
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setQ(""); setState(""); setSpecialism(""); setDegree("all"); setProfession(""); setPsypactOnly(false); setPage(0);
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: "0.82rem", marginTop: "-0.4rem" }}>
        {filtered.length} of {people.length} colleagues
        {pageCount > 1 ? `, page ${currentPage + 1} of ${pageCount}` : ""}
      </p>

      <div className="directory-condensed-list">
        {pageRows.map((p) => (
          <div key={p.id} className="directory-condensed-row">
            <Avatar url={p.avatarUrl} name={p.name} size={38} ring={p.tier} />
            <div className="directory-condensed-main">
              <div className="directory-condensed-line1">
                <a href={`/dashboard/people/${p.id}`} className={p.tier !== "none" ? `person-link tier-${p.tier}` : "person-link"}>
                  {p.credentialPrefix ? `${p.credentialPrefix} ` : ""}
                  {p.name}
                </a>
                <ProfessionTag profession={p.profession} />
                {p.psypact && <span className="tag" title="PSYPACT participating">PSYPACT</span>}
              </div>
              <div className="directory-condensed-line2 muted">
                {[p.city, p.state].filter(Boolean).join(", ") || "Location not listed"}
                {p.specialisms.length > 0 && (
                  <>
                    {" · "}
                    {p.specialisms.slice(0, 2).join(", ")}
                    {p.specialisms.length > 2 ? ` +${p.specialisms.length - 2} more` : ""}
                  </>
                )}
              </div>
            </div>
            <div className="directory-condensed-actions">
              <TierTag tier={p.tier} />
              {p.connectionStatus === "accepted" ? (
                <form action={startConversation}>
                  <input type="hidden" name="participant_ids" value={p.id} />
                  <input type="hidden" name="title" value={`${p.credentialPrefix || ""} ${p.name}`.trim()} />
                  <input type="hidden" name="body" value={`Hi ${p.name}, `} />
                  <button type="submit" className="secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>
                    Message
                  </button>
                </form>
              ) : p.connectionStatus === "pending" ? (
                <span className="muted" style={{ fontSize: "0.8rem" }}>Pending</span>
              ) : (
                <form action={sendConnectionRequest}>
                  <input type="hidden" name="addressee_id" value={p.id} />
                  <input type="hidden" name="tier" value="trusted_colleague" />
                  <button type="submit" className="btn-tier-trusted_colleague" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>
                    Connect
                  </button>
                </form>
              )}
              {p.saved ? (
                <form action={removeSavedClinicianAction}>
                  <input type="hidden" name="clinician_id" value={p.id} />
                  <button type="submit" className="secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>Saved</button>
                </form>
              ) : (
                <form action={saveClinicianAction}>
                  <input type="hidden" name="clinician_id" value={p.id} />
                  <button type="submit" className="secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>Save</button>
                </form>
              )}
            </div>
          </div>
        ))}
        {pageRows.length === 0 && (
          <p className="muted">
            {people.length === 0 ? "No verified colleagues yet." : "No colleagues match those filters."}
          </p>
        )}
      </div>

      {pageCount > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "0.9rem" }}>
          <button type="button" className="secondary" disabled={currentPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </button>
          <span className="muted" style={{ alignSelf: "center", fontSize: "0.85rem" }}>
            Page {currentPage + 1} of {pageCount}
          </span>
          <button type="button" className="secondary" disabled={currentPage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
