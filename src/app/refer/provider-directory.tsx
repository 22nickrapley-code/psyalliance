"use client";

import { useMemo, useState } from "react";
import Avatar from "../dashboard/avatar";
import { professionLabel, type Profession } from "@/lib/profession";
import UsStateDatalist from "@/components/us-state-datalist";

export type SpecialistEntry = {
  id: string;
  name: string;
  credentialPrefix: string | null;
  profession: Profession;
  city: string | null;
  state: string | null;
  specialisms: string[];
  psypact: boolean;
  avatarUrl: string | null;
};

function ProfessionTag({ profession }: { profession: Profession }) {
  return (
    <span className={`tag${profession === "psychiatrist" ? " psychiatrist" : ""}`}>
      {professionLabel(profession)}
    </span>
  );
}

// Read-only, deliberately: no profile link-through, no connect/message
// button - the only action available on a row is "Send a referral", via
// the same compose-trigger pattern as Endorsements (a plain button opens
// an inline form, no separate page navigation). Live-filter search,
// same instant-narrow pattern as the member-side Full verified directory.
export default function ProviderDirectory({
  people,
  specialismOptions,
  submitReferral,
}: {
  people: SpecialistEntry[];
  specialismOptions: string[];
  submitReferral: (formData: FormData) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [specialism, setSpecialism] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const st = state.trim().toUpperCase();
    return people
      .filter((p) => !qq || p.name.toLowerCase().includes(qq))
      .filter((p) => !st || p.state === st)
      .filter((p) => !specialism || p.specialisms.includes(specialism))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people, q, state, specialism]);

  const hasAnyFilter = q || state || specialism;

  return (
    <div>
      <div className="field-row" style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div className="field">
          <label htmlFor="ref-dir-q">Name</label>
          <input id="ref-dir-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" />
        </div>
        <div className="field" style={{ maxWidth: 100 }}>
          <label htmlFor="ref-dir-state">State</label>
          <input
            id="ref-dir-state"
            type="text"
            maxLength={24}
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="TX"
            list="us-states"
            autoComplete="off"
          />
          <UsStateDatalist />
        </div>
        <div className="field">
          <label htmlFor="ref-dir-specialism">Specialism</label>
          <select id="ref-dir-specialism" value={specialism} onChange={(e) => setSpecialism(e.target.value)}>
            <option value="">Any</option>
            {specialismOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {hasAnyFilter && (
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button type="button" className="btn secondary" onClick={() => { setQ(""); setState(""); setSpecialism(""); }}>
              Clear
            </button>
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: "0.82rem", marginTop: "-0.4rem" }}>
        {filtered.length} of {people.length} specialists currently accepting referrals
      </p>

      <div className="directory-condensed-list">
        {filtered.map((p) => (
          <div key={p.id} className="directory-condensed-row">
            <Avatar url={p.avatarUrl} name={p.name} size={38} />
            <div className="directory-condensed-main">
              <div className="directory-condensed-line1">
                <span className="person-link">{p.credentialPrefix ? `${p.credentialPrefix} ` : ""}{p.name}</span>
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
              <details className="endorsement-compose-trigger">
                <summary>Send a referral</summary>
                <div className="endorsement-compose-panel refer-compose-panel">
                  <form action={submitReferral}>
                    <input type="hidden" name="target_profile_id" value={p.id} />
                    <div className="field-row">
                      <div className="field">
                        <label>Patient initials</label>
                        <input name="patient_initials" type="text" maxLength={8} placeholder="Optional, e.g. J.D." />
                      </div>
                      <div className="field">
                        <label>Age range</label>
                        <input name="patient_age_range" type="text" maxLength={40} placeholder="Optional, e.g. Adult, 8-12" />
                      </div>
                      <div className="field">
                        <label>Urgency</label>
                        <select name="urgency" defaultValue="routine">
                          <option value="routine">Routine</option>
                          <option value="soon">Soon</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                    <div className="field">
                      <label>Reason for referral</label>
                      <textarea name="reason" rows={2} required placeholder="Brief clinical reason, no need for detail" />
                    </div>
                    <div className="field">
                      <label>How should their office reach you?</label>
                      <input name="contact_details" type="text" required placeholder="Your office phone or email" />
                    </div>
                    <button type="submit" style={{ marginTop: "0.35rem" }}>Send referral</button>
                  </form>
                </div>
              </details>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="muted">
            {people.length === 0 ? "No specialists are currently accepting referrals." : "No specialists match those filters."}
          </p>
        )}
      </div>
    </div>
  );
}
