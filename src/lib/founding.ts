import { stateName } from "@/lib/open-states";

// Founding members (Nick, 11 Oct): the first 50 members in each state, counted
// when their license is approved, in their main practice state. They never
// pay for membership. Migration 0112 gives the places; these are the words.
export const FOUNDING_PLACES = 50;
export const FOUNDING_LINE = "The first 50 members in each state are founding members, free for life.";
export const FOUNDING_SHORT = "The first 50 in each state join free for life.";
export const FOUNDING_HOW =
  "A place counts once your license is approved, in your main practice state, and is yours for as long as you remain a member.";
export const FOUNDING_AFTER = "After a state's founding places are taken, membership there will be paid. We'll publish the price before then.";

export type FoundingPlace = { state: string; place: number };
export type FoundingCount = { state: string; taken: number; left: number };

// The member's own place, if they have one. Before migration 0112 runs the
// table doesn't exist; that reads as "no place".
export async function loadFoundingPlace(supabase: any, profileId: string): Promise<FoundingPlace | null> {
  const { data, error } = await supabase.from("founding_places").select("state, place").eq("profile_id", profileId).maybeSingle();
  if (error || !data) return null;
  return { state: String(data.state), place: Number(data.place) };
}

export const foundingLabel = (f: FoundingPlace) => `${stateName(f.state)} · #${f.place}`;

// Places left per state, shown publicly once a state has 10 founding members.
export async function loadFoundingCounts(supabase: any): Promise<FoundingCount[]> {
  const { data, error } = await supabase.rpc("founding_places_left");
  if (error || !Array.isArray(data)) return [];
  return data.map((r: any) => ({ state: String(r.state), taken: Number(r.taken), left: Math.max(0, Number(r.places_left)) }));
}

// "31 founding places left in New York · Massachusetts: all taken"
export function foundingCountsLine(counts: FoundingCount[]) {
  if (!counts.length) return null;
  return counts
    .map((c) => (c.left > 0 ? `${c.left} founding place${c.left === 1 ? "" : "s"} left in ${stateName(c.state)}` : `${stateName(c.state)}: all founding places taken`))
    .join(" · ");
}
