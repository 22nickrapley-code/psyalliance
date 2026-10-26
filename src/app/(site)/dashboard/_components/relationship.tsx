"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { REL_LABEL, relOf, type Rel, type RelationshipMap } from "@/lib/relationship-map";

// The member's relationship map, given once by the dashboard layout, so any
// avatar or tag anywhere can colour itself the same way (Nick, 18 Oct).
// Demos and previews, outside the layout, pass `rel` directly or supply
// their own map.
const Ctx = createContext<RelationshipMap | null>(null);

export function RelationshipProvider({ value, children }: { value: RelationshipMap | null; children: ReactNode }) {
  const stable = useMemo(() => value, [value]);
  return <Ctx.Provider value={stable}>{children}</Ctx.Provider>;
}

export function useRel(id?: string | null, rel?: Rel): Rel {
  const map = useContext(Ctx);
  return rel || relOf(map, id);
}

export function initialsOf(name: string) {
  return (
    name
      .replace(/,.*$/, "")
      .replace(/^(dr\.?|mr\.?|ms\.?|mrs\.?)\s+/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

// A person's disc: initials on their relationship colour, or their photo
// with a ring in it. Everyone else is grey with no ring.
export function PersonAvatar({ name, url, size, id, rel }: { name: string; url?: string | null; size?: number; id?: string | null; rel?: Rel }) {
  const r = useRel(id, rel);
  const style = size ? { width: size, height: size, flexBasis: size, fontSize: Math.round(size * 0.38) } : undefined;
  const title = r === "other" || r === "you" ? undefined : REL_LABEL[r];
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`avatar rel-${r}`} style={{ ...style, objectFit: "cover" }} title={title} />;
  }
  return (
    <span className={`avatar rel-${r}`} style={style} aria-hidden="true" title={title}>
      {initialsOf(name)}
    </span>
  );
}

// The relationship as a small pill, in the same colour as the disc.
export function RelTag({ id, rel, fallback, showOther }: { id?: string | null; rel?: Rel; fallback?: Rel; showOther?: boolean }) {
  let r = useRel(id, rel);
  if (r === "other" && fallback) r = fallback;
  if (r === "you" || (r === "other" && !showOther)) return null;
  return <span className={`rel-tag rel-${r}`}>{REL_LABEL[r]}</span>;
}
