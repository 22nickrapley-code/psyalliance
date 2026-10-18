import { findMatches, type Match } from "@/lib/match-engine";
import { getTrustedIds, getTrustedByIds } from "@/lib/trusted";

// "Suggested by PsyAlliance" (Nick, 18 Oct): the colleagues Network lists
// under Suggested for you, the same people everywhere their avatar appears.
// People who added you as a trusted colleague come first, then the best
// matches for your practice who aren't already trusted or worked with.
// The list is kept in suggested_colleagues (migration 0116) so every page
// can colour avatars without matching again; Network refreshes it on each
// visit and Home when it's more than a day old.

const DAY_MS = 24 * 60 * 60 * 1000;

export type SuggestionSet = { addedYou: string[]; matches: Match[]; ids: string[] };

export async function computeSuggestions(supabase: any, me: string, limit = 10): Promise<SuggestionSet & { trusted: Set<string>; worked: Map<string, number> }> {
  const [trusted, trustedBy, { data: workedRows }, { data: myProfile }, { data: myFocusRows }] = await Promise.all([
    getTrustedIds(supabase, me),
    getTrustedByIds(supabase, me),
    supabase.from("worked_with_before").select("colleague_id, interaction_count").eq("profile_id", me),
    supabase.rpc("my_profile").select("primary_state").maybeSingle(),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, rank, lookup_values!inner(category)")
      .eq("profile_id", me)
      .eq("lookup_values.category", "treatment_specialism")
      .order("rank"),
  ]);
  const worked = new Map<string, number>(((workedRows as any[]) || []).map((w: any) => [w.colleague_id as string, Number(w.interaction_count) || 1]));
  const addedYou = [...trustedBy].filter((id) => !trusted.has(id));
  const { matches } = await findMatches(
    supabase,
    me,
    { kind: "discovery", focusIds: ((myFocusRows as any[]) || []).slice(0, 3).map((r: any) => Number(r.lookup_value_id)), state: (myProfile as any)?.primary_state || null },
    { exclude: [...trusted, ...addedYou, ...worked.keys()], limit }
  );
  const ids = [...addedYou, ...matches.map((m) => m.profileId)].slice(0, limit);
  return { addedYou, matches, ids, trusted, worked };
}

export async function saveSuggestions(supabase: any, ids: string[]) {
  // Before migration 0116 there's nowhere to keep them; nothing breaks.
  await supabase.rpc("set_my_suggestions", { p_ids: ids }).then(
    () => null,
    () => null
  );
}

// Home: recompute only when the kept list is missing or a day old.
export async function ensureFreshSuggestions(supabase: any, me: string): Promise<boolean> {
  const { data, error } = await supabase.from("suggestion_runs").select("computed_at").eq("profile_id", me).maybeSingle();
  if (error) return false;
  if (data?.computed_at && Date.now() - new Date(data.computed_at).getTime() < DAY_MS) return false;
  const { ids } = await computeSuggestions(supabase, me);
  await saveSuggestions(supabase, ids);
  return true;
}
