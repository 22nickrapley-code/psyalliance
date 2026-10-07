"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

// One box: type to narrow the list, or open it and pick. The chosen value
// is submitted under `name`, so forms and server parsing are unchanged.
export function SearchableSelect({
  name,
  label,
  options,
  defaultValue = "",
  required,
  emptyLabel,
  searchPlaceholder = "Type to search",
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
  emptyLabel: string;
  searchPlaceholder?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const current = options.find((o) => o.value === value) || null;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    const starts = options.filter((o) => o.label.toLowerCase().startsWith(t));
    const rest = options.filter((o) => !o.label.toLowerCase().startsWith(t) && o.label.toLowerCase().includes(t));
    return [...starts, ...rest];
  }, [q, options]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (v: string) => {
    setValue(v);
    setQ("");
    setOpen(false);
  };

  return (
    <div className={`field searchable combo${open ? " open" : ""}`} ref={root}>
      <label htmlFor={`${id}-q`}>{label}</label>
      <div className="combo-box">
        <input
          id={`${id}-q`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          className="combo-input"
          value={open ? q : current?.label || ""}
          placeholder={open ? searchPlaceholder : emptyLabel}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              if (open && shown[active]) {
                e.preventDefault();
                pick(shown[active].value);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
              setQ("");
            }
          }}
        />
        <svg className="combo-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {/* Carries the value, and lets the browser insist on a choice. */}
      <input className="combo-value" name={name} value={value} required={required} onChange={() => {}} tabIndex={-1} aria-hidden="true" />
      {open && (
        <ul className="combo-list" role="listbox" id={`${id}-list`} ref={listRef}>
          {shown.length === 0 && <li className="combo-empty">No match. Try another word.</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              data-i={i}
              aria-selected={o.value === value}
              className={`${i === active ? "active" : ""}${o.value === value ? " chosen" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.value);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
