// Who each person is to the signed-in member, in four kinds, used for every
// avatar and relationship tag on the site (Nick, 18 Oct): trusted colleague,
// worked with before, suggested by PsyAlliance, everyone else. Read once per
// page in the dashboard layout; the suggestions come from the cached list
// that Home and Network keep fresh (lib/suggestions.ts).

export type Rel = "you" | "trusted" | "worked" | "suggested" | "other";
export type RelationshipMap = { me: string; trusted: string[]; worked: string[]; suggested: string[] };

export const REL_LABEL: Record<Rel, string> = {
  you: "You",
  trusted: "Trusted colleague",
  worked: "Worked with before",
  suggested: "Suggested by PsyAlliance",
  other: "Verified network",
};

export const EMPTY_MAP: RelationshipMap = { me: "", trusted: [], worked: [], suggested: [] };

export async function loadRelationshipMap(supabase: any, me: string): Promise<RelationshipMap> {
  const [t, w, s] = await Promise.all([
    supabase.from("trusted_colleagues").select("colleague_id").eq("profile_id", me),
    supabase.from("worked_with_before").select("colleague_id").eq("profile_id", me),
    // Before migration 0116 the table doesn't exist: no suggestions yet.
    supabase.from("suggested_colleagues").select("colleague_id, position").eq("profile_id", me).order("position"),
  ]);
  return {
    me,
    trusted: ((t.data as any[]) || []).map((r) => String(r.colleague_id)),
    worked: ((w.data as any[]) || []).map((r) => String(r.colleague_id)),
    suggested: s.error ? [] : ((s.data as any[]) || []).map((r) => String(r.colleague_id)),
  };
}

// Trusted wins over worked with, which wins over suggested.
export function relOf(map: RelationshipMap | null | undefined, id: string | null | undefined): Rel {
  if (!map || !id) return "other";
  if (id === map.me) return "you";
  if (map.trusted.includes(id)) return "trusted";
  if (map.worked.includes(id)) return "worked";
  if (map.suggested.includes(id)) return "suggested";
  return "other";
}
