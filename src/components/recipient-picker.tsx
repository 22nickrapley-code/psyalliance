"use client";

import { useMemo, useState } from "react";
import Avatar from "@/app/dashboard/avatar";

// Client-side "Send a New Message" recipient picker. The full contact list
// (every colleague, already loaded server-side with zero extra queries per
// filter) is handed in as a plain serializable prop, and every filter -
// search text, state, specialism, profession, connection tier, sort - is
// applied entirely in local React state. Nothing here ever re-submits a
// form or navigates: per Nick's note that "you don't have to click filter,
// it just changes the results below" and "the whole page doesn't reload,
// it just dynamically changes the names," this replaces the old GET-form +
// wide checkbox-grid, which felt "messy" and "too much to take in."
export type PickerContact = {
  id: string;
  name: string;
  credentialPrefix: string | null;
  state: string | null;
  profession: string;
  specialisms: string[];
  tier: "partner" | "trusted_colleague" | "bench" | "recommended" | "none";
  avatarUrl?: string | null;
};

const TIER_ORDER: Record<string, number> = { partner: 0, trusted_colleague: 0, bench: 1, recommended: 2, none: 3 };

export default function RecipientPicker({
  contacts,
  specialismOptions,
  fieldName = "participant_ids",
}: {
  contacts: PickerContact[];
  specialismOptions: string[];
  fieldName?: string;
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [specialism, setSpecialism] = useState("");
  const [profession, setProfession] = useState("");
  // Empty set = ALL (no tier filter). Otherwise each active tier button is
  // OR'd together, so Partner + Bench (say) shows both at once, letting Nick
  // message multiple groups in one go instead of picking a single tier.
  const [tierFilter, setTierFilter] = useState<Set<"partner" | "trusted_colleague" | "bench" | "recommended">>(new Set());
  const [sortBy, setSortBy] = useState("alpha");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const st = state.trim().toUpperCase();
    return contacts
      .filter((c) => !qq || c.name.toLowerCase().includes(qq))
      .filter((c) => tierFilter.size === 0 || (c.tier !== "none" && tierFilter.has(c.tier as "partner" | "trusted_colleague" | "bench" | "recommended")))
      .filter((c) => !st || c.state === st)
      .filter((c) => !specialism || c.specialisms.includes(specialism))
      .filter((c) => !profession || c.profession === profession)
      .sort((a, b) => {
        if (sortBy === "connection") {
          const d = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
          if (d !== 0) return d;
          return a.name.localeCompare(b.name);
        }
        if (sortBy === "state") {
          const d = (a.state || "zz").localeCompare(b.state || "zz");
          if (d !== 0) return d;
          return a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name);
      });
  }, [contacts, q, state, specialism, profession, tierFilter, sortBy]);

  function toggleTierFilter(tier: "partner" | "trusted_colleague" | "bench" | "recommended") {
    setTierFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible(checkedAll: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const c of filtered) {
        if (checkedAll) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  const allVisibleChecked = filtered.length > 0 && filtered.every((c) => checked.has(c.id));
  // Sept 23 audit: "Select all shown" defaulted to showing (and could select)
  // literally every colleague in the network in one click, since no filter
  // is active by default - flagged as too easy to accidentally mass-compose
  // to everyone. The control itself is useful (message a filtered group at
  // once), so rather than remove it, it only works once a filter has
  // actually narrowed the list - selecting the whole unfiltered network
  // still requires deliberately doing that one person at a time.
  const hasActiveFilter = q.trim() !== "" || state.trim() !== "" || specialism !== "" || profession !== "" || tierFilter.size > 0;

  return (
    <div>
      <div className="field-row" style={{ flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <div className="field" style={{ minWidth: 160 }}>
          <label htmlFor="rp-q">Search colleagues</label>
          <input id="rp-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" />
        </div>
        <div className="field" style={{ maxWidth: 90 }}>
          <label htmlFor="rp-state">State</label>
          <input
            id="rp-state"
            type="text"
            maxLength={24}
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="TX"
            list="us-states"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="rp-specialism">Specialism</label>
          <select id="rp-specialism" value={specialism} onChange={(e) => setSpecialism(e.target.value)}>
            <option value="">Any</option>
            {specialismOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rp-profession">Profession</label>
          <select id="rp-profession" value={profession} onChange={(e) => setProfession(e.target.value)}>
            <option value="">Any</option>
            <option value="psychologist">Psychologist</option>
            <option value="psychiatrist">Psychiatrist</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="rp-sort">Sort by</label>
          <select id="rp-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="alpha">Alphabetical</option>
            <option value="connection">Connection status</option>
            <option value="state">State</option>
          </select>
        </div>
      </div>

      <div className="ov-box-toggle" style={{ marginBottom: "0.5rem" }}>
        <button type="button" className={tierFilter.size === 0 ? "active" : ""} onClick={() => setTierFilter(new Set())}>
          ALL
        </button>
        <button type="button" className={tierFilter.has("trusted_colleague") ? "active" : ""} onClick={() => toggleTierFilter("trusted_colleague")}>
          Trusted Colleague
        </button>
        <button type="button" className={tierFilter.has("bench") ? "active" : ""} onClick={() => toggleTierFilter("bench")}>
          Bench
        </button>
        <button
          type="button"
          className={tierFilter.has("recommended") ? "active" : ""}
          onClick={() => toggleTierFilter("recommended")}
        >
          Suggested for you
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
        <label
          style={{ margin: 0, fontWeight: 400, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          title={hasActiveFilter ? undefined : "Filter the list (search, state, specialism, profession, or a connection tier) before selecting everyone shown"}
        >
          <input
            type="checkbox"
            checked={allVisibleChecked}
            disabled={!hasActiveFilter}
            onChange={(e) => selectAllVisible(e.target.checked)}
          />
          {hasActiveFilter ? `Select all shown (${filtered.length})` : `Filter first to select a group (${filtered.length} shown)`}
        </label>
        <span className="muted" style={{ fontSize: "0.8rem" }}>{checked.size} selected</span>
      </div>

      <div className="recipient-picker-list">
        {filtered.map((c) => (
          <label key={c.id} className="recipient-picker-row">
            <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} />
            <Avatar url={c.avatarUrl} name={c.name} size={26} ring={c.tier} />
            <span className={c.tier !== "none" ? `person-link-inline tier-${c.tier}` : "person-link-inline"}>
              {c.credentialPrefix ? `${c.credentialPrefix} ` : ""}
              {c.name}
            </span>
            {c.state && <span className="muted" style={{ marginLeft: "0.35rem" }}>({c.state})</span>}
          </label>
        ))}
        {filtered.length === 0 && <p className="muted" style={{ padding: "0.6rem" }}>No colleagues match that search.</p>}
      </div>

      {/* The visible checkboxes above are UI state only (no name attribute,
          so they submit nothing by themselves); these mirrored hidden inputs
          are what the surrounding server-action form actually sends, kept in
          sync with `checked` so selection survives any amount of filtering. */}
      {Array.from(checked).map((id) => (
        <input key={id} type="hidden" name={fieldName} value={id} />
      ))}
    </div>
  );
}
