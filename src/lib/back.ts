// "Take me back to where I was." Links into an edit screen carry the page
// they came from (?back=/dashboard/...), the edit form passes it along as a
// hidden field, and the save returns there instead of somewhere new
// (Nick, 10 Oct: never make someone re-find their place after a save).

// Only signed-in pages on this site are accepted as a way back.
export function safeBack(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (!s.startsWith("/dashboard") || s.startsWith("//") || s.includes("\\")) return null;
  try {
    const u = new URL(s, "http://x");
    if (u.origin !== "http://x") return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

// The way back with a short note for the page to show (and nothing stale
// from an earlier save).
export function backWith(back: string, note: Record<string, string>): string {
  const u = new URL(back, "http://x");
  for (const k of ["error", "saved", "done", "added", "removed", "trusted", "untrusted"]) u.searchParams.delete(k);
  for (const [k, v] of Object.entries(note)) u.searchParams.set(k, v);
  const q = u.searchParams.toString();
  return `${u.pathname}${q ? `?${q}` : ""}${u.hash}`;
}

// A link into an edit screen that remembers where it came from.
export function withBack(href: string, back: string | null | undefined): string {
  if (!back) return href;
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}back=${encodeURIComponent(back)}${hash ? `#${hash}` : ""}`;
}

// What to call the way back: "Back to Home", "Back to Refer".
export function backLabel(back: string): string {
  const p = back.split(/[?#]/)[0];
  if (p === "/dashboard") return "Home";
  const names: [RegExp, string][] = [
    [/^\/dashboard\/profile/, "Profile"],
    [/^\/dashboard\/refer/, "Refer"],
    [/^\/dashboard\/cover/, "Cover"],
    [/^\/dashboard\/consult/, "Consult"],
    [/^\/dashboard\/network/, "your network"],
    [/^\/dashboard\/clinicians/, "Clinicians"],
    [/^\/dashboard\/messages/, "Messages"],
    [/^\/dashboard\/settings/, "Settings"],
    [/^\/dashboard\/documents/, "the Practice Library"],
    [/^\/dashboard\/availability/, "Availability"],
    [/^\/dashboard\/credentials/, "Credentials"],
    [/^\/dashboard\/continuity/, "your continuity plan"],
  ];
  return names.find(([re]) => re.test(p))?.[1] || "where you were";
}
