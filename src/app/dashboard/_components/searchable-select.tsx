"use client";

import { useMemo, useState } from "react";

// A native select with a type-to-narrow box above it. The select still
// submits the value (and still works without JavaScript), so forms and
// server parsing are unchanged.
export function SearchableSelect({
  name,
  label,
  options,
  defaultValue = "",
  required,
  emptyLabel,
  searchPlaceholder = "Type to narrow the list",
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
  emptyLabel: string;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const [value, setValue] = useState(defaultValue);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    const hits = options.filter((o) => o.label.toLowerCase().includes(t));
    // Keep the current choice visible even when it doesn't match.
    const current = options.find((o) => o.value === value);
    return current && !hits.includes(current) ? [current, ...hits] : hits;
  }, [q, options, value]);
  return (
    <div className="field searchable">
      <label htmlFor={`${name}-select`}>{label}</label>
      <input
        type="search"
        className="searchable-q"
        value={q}
        placeholder={searchPlaceholder}
        aria-label={`Search ${label.toLowerCase()}`}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          const t = next.trim().toLowerCase();
          const hits = t ? options.filter((o) => o.label.toLowerCase().includes(t)) : [];
          if (hits.length === 1) setValue(hits[0].value);
        }}
      />
      <select id={`${name}-select`} name={name} value={value} required={required} onChange={(e) => setValue(e.target.value)}>
        <option value="">{shown.length === 0 ? "No match: try another word" : emptyLabel}</option>
        {shown.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
