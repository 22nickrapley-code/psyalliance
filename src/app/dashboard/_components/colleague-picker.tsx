"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Suggestion, SuggestionGroup } from "@/lib/colleague-suggestions";
import { searchColleaguesAction } from "../colleague-actions";

const GROUPS: { key: SuggestionGroup; title: string }[] = [
  { key: "recent", title: "Recent conversations" },
  { key: "trusted", title: "Your trusted circle" },
  { key: "worked", title: "Worked with before" },
  { key: "saved", title: "Saved" },
  { key: "network", title: "Elsewhere in the network" },
];

const initials = (name: string) =>
  name
    .replace(/^(dr\.?)\s+/i, "")
    .replace(/,.*$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

function Face({ s, size = 38 }: { s: Suggestion; size?: number }) {
  return (
    <span className={`picker-face g-${s.group}`} style={{ width: size, height: size, flexBasis: size }} aria-hidden="true">
      {s.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.avatarUrl} alt="" />
      ) : (
        initials(s.name)
      )}
    </span>
  );
}

// Choose colleagues the way you'd think of them: the people you've been
// talking to, then your trusted circle, colleagues you've worked with and
// people you saved. Typing searches those first, then the whole network.
export function ColleaguePicker({
  suggestions,
  name,
  mode = "single",
  initial = [],
  label = "To",
  placeholder = "Search by name, or pick someone below",
  limitPerGroup = 4,
}: {
  suggestions: Suggestion[];
  name: string;
  mode?: "single" | "multi";
  initial?: string[];
  label?: string;
  placeholder?: string;
  limitPerGroup?: number;
}) {
  const [picked, setPicked] = useState<Suggestion[]>(() => suggestions.filter((s) => initial.includes(s.id)));
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [browsing, setBrowsing] = useState(mode === "multi" || picked.length === 0);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRemote([]);
      return;
    }
    const n = ++seq.current;
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await searchColleaguesAction(term);
        if (n === seq.current) setRemote(res);
      } finally {
        if (n === seq.current) setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const local = term ? suggestions.filter((s) => s.name.toLowerCase().includes(term) || s.where.toLowerCase().includes(term)) : suggestions;
    const known = new Set(local.map((s) => s.id));
    return [...local, ...remote.filter((r) => !known.has(r.id) && !suggestions.some((s) => s.id === r.id))];
  }, [q, suggestions, remote]);

  const isPicked = (id: string) => picked.some((p) => p.id === id);
  const choose = (s: Suggestion) => {
    if (mode === "single") {
      setPicked([s]);
      setBrowsing(false);
      setQ("");
      return;
    }
    setPicked((cur) => (cur.some((p) => p.id === s.id) ? cur.filter((p) => p.id !== s.id) : [...cur, s]));
  };

  return (
    <div className={`colleague-picker mode-${mode}`}>
      <span className="picker-label">{label}</span>
      {picked.map((p) => (
        <input key={p.id} type="hidden" name={name} value={p.id} />
      ))}

      {mode === "single" && picked[0] && !browsing ? (
        <div className="picker-chosen">
          <Face s={picked[0]} size={44} />
          <span className="picker-text">
            <b>{picked[0].name}</b>
            <small>{[picked[0].reason, picked[0].where].filter(Boolean).join(" · ")}</small>
          </span>
          <button type="button" className="btn ghost small-btn" onClick={() => setBrowsing(true)}>Change</button>
        </div>
      ) : (
        <>
          {mode === "multi" && picked.length > 0 && (
            <div className="picker-chips" aria-label="Chosen">
              {picked.map((p) => (
                <span key={p.id} className="picker-chip">
                  <Face s={p} size={24} />
                  {p.name}
                  <button type="button" onClick={() => choose(p)} aria-label={`Remove ${p.name}`}>&times;</button>
                </span>
              ))}
            </div>
          )}
          <div className="picker-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              aria-label="Search colleagues"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (list[0]) choose(list[0]);
                }
              }}
            />
            {searching && <span className="picker-spin" aria-hidden="true" />}
          </div>
          <div className="picker-list" role="listbox" aria-multiselectable={mode === "multi"}>
            {list.length === 0 && (
              <p className="picker-empty">
                {q.trim().length >= 2 && !searching ? "No one in the verified network matches that name." : "Your circle is empty so far. Type a name to search the verified network."}
              </p>
            )}
            {GROUPS.map((g) => {
              const items = list.filter((s) => s.group === g.key);
              if (!items.length) return null;
              const all = !!q.trim() || expanded[g.key];
              const shown = all ? items : items.slice(0, limitPerGroup);
              return (
                <div key={g.key} className="picker-group">
                  <div className="picker-group-title">
                    <span>{g.title}</span>
                    <small>{items.length}</small>
                  </div>
                  {shown.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="option"
                      aria-selected={isPicked(s.id)}
                      className={`picker-row${isPicked(s.id) ? " on" : ""}`}
                      onClick={() => choose(s)}
                    >
                      <Face s={s} />
                      <span className="picker-text">
                        <b>{s.name}</b>
                        <small>{[s.reason, s.where].filter(Boolean).join(" · ")}</small>
                        {s.focus.length > 0 && <span className="picker-focus">{s.focus.join(", ")}</span>}
                      </span>
                      <span className="picker-tick" aria-hidden="true">{isPicked(s.id) ? "✓" : mode === "multi" ? "+" : ""}</span>
                    </button>
                  ))}
                  {!all && items.length > limitPerGroup && (
                    <button type="button" className="picker-more" onClick={() => setExpanded({ ...expanded, [g.key]: true })}>
                      Show all {items.length}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
