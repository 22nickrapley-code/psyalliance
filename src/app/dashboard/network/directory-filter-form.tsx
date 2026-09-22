"use client";

import { useRef } from "react";
import UsStateDatalist from "@/components/us-state-datalist";

// Same GET-based filter form as before (still bookmarkable/shareable URLs,
// still works with JS off - Enter on the Name field submits it), just with
// every control auto-submitting on change so there's no separate Filter
// button to click. A ref-triggered requestSubmit() keeps this a normal
// form submission (full navigation with new searchParams), not a fetch.
export default function DirectoryFilterForm({
  q,
  stateFilter,
  specialismFilter,
  degreeFilter,
  psypactFilter,
  professionFilter,
  allSpecialisms,
}: {
  q: string;
  stateFilter: string;
  specialismFilter: string;
  degreeFilter: string;
  psypactFilter: boolean;
  professionFilter: string;
  allSpecialisms: { value: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  const hasAnyFilter = q || stateFilter || specialismFilter || degreeFilter || psypactFilter || professionFilter;

  return (
    <form
      ref={formRef}
      method="GET"
      className="field-row"
      style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}
    >
      <div className="field">
        <label htmlFor="q">Name</label>
        <input
          id="q"
          name="q"
          type="text"
          defaultValue={q}
          placeholder="Search by name"
          onChange={(e) => {
            window.clearTimeout((e.target as any)._debounce);
            (e.target as any)._debounce = window.setTimeout(submit, 400);
          }}
        />
      </div>
      <div className="field" style={{ maxWidth: 100 }}>
        <label htmlFor="state">State</label>
        <input
          id="state"
          name="state"
          type="text"
          maxLength={24}
          defaultValue={stateFilter}
          placeholder="TX or Texas"
          list="us-states"
          autoComplete="off"
          onChange={submit}
        />
        <UsStateDatalist />
      </div>
      <div className="field">
        <label htmlFor="specialism">Specialism</label>
        <select id="specialism" name="specialism" defaultValue={specialismFilter} onChange={submit}>
          <option value="">Any</option>
          {allSpecialisms.map((s) => (
            <option key={s.value} value={s.value}>{s.value}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="degree">Connection status</label>
        <select id="degree" name="degree" defaultValue={degreeFilter} onChange={submit}>
          <option value="all">All</option>
          <option value="trusted_colleague">Trusted Colleague</option>
          <option value="bench">Bench</option>
          <option value="recommended">Suggested for you</option>
          <option value="none">Not yet connected</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="profession">Profession</label>
        <select id="profession" name="profession" defaultValue={professionFilter} onChange={submit}>
          <option value="">Any</option>
          <option value="psychologist">Psychologist</option>
          <option value="psychiatrist">Psychiatrist</option>
        </select>
      </div>
      <div className="field checkbox-row" style={{ flex: "0 0 auto", alignSelf: "center" }}>
        <input id="psypact" name="psypact" type="checkbox" value="1" defaultChecked={psypactFilter} onChange={submit} />
        <label htmlFor="psypact" style={{ margin: 0, fontWeight: 400, color: "var(--text)" }}>
          PSYPACT only
        </label>
      </div>
      {hasAnyFilter && (
        <div className="field" style={{ flex: "0 0 auto" }}>
          <a href="/dashboard/network" className="btn secondary" style={{ display: "inline-block" }}>Clear</a>
        </div>
      )}
    </form>
  );
}
