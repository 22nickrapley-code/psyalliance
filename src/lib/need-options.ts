import { createClient } from "@/lib/supabase/server";
import { US_STATES } from "@/lib/us-states";
import { IS_DEMO_SITE } from "@/lib/env";

// The controlled vocabularies used by every "describe the need" form
// (Refer, Cover, Home quick search), so criteria always match what
// members select on their own profiles.

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Option = { id: number; value: string };

export type NeedOptions = {
  focus: Option[];
  insurance: Option[];
  language: Option[];
  ageBands: string[];
  states: { code: string; name: string }[];
  // The member's own practice state: every search starts there.
  homeState: string | null;
};

export async function loadNeedOptions(supabase: Supabase): Promise<NeedOptions> {
  const [{ data }, { data: me }, coverage] = await Promise.all([
    supabase
      .from("lookup_values")
      .select("id, category, value")
      .in("category", ["treatment_specialism", "insurance", "language", "age_group_specialism"])
      .order("value"),
    supabase.rpc("my_profile").select("primary_state").maybeSingle<any>(),
    // On the demo site, offer only what the fictional network can answer,
    // so a prospect's search never comes back empty.
    IS_DEMO_SITE ? supabase.rpc("network_coverage").then((r) => r.data as any) : Promise.resolve(null),
  ]);
  const keep = (ids: number[] | undefined) => (o: Option) => !ids || ids.includes(o.id);
  const by = (c: string) => (data || []).filter((r: any) => r.category === c).map((r: any) => ({ id: Number(r.id), value: String(r.value) }));
  const ageOrder = ["Children", "Adolescents", "Young Adults", "Adults", "Seniors"];
  const states = coverage?.states?.length ? US_STATES.filter((s) => coverage.states.includes(s.code)) : US_STATES;
  const home = me?.primary_state ? String(me.primary_state).toUpperCase() : null;
  return {
    focus: by("treatment_specialism").filter(keep(coverage?.focus)),
    insurance: by("insurance").filter(keep(coverage?.insurance)),
    language: by("language").filter(keep(coverage?.language)),
    ageBands: by("age_group_specialism")
      .map((o) => o.value)
      .sort((a, b) => ageOrder.indexOf(a) - ageOrder.indexOf(b)),
    states,
    homeState: home && states.some((s) => s.code === home) ? home : null,
  };
}

// Parses need criteria from a query string or form (same field names
// everywhere): focus (repeatable), state, city, insurance, age, setting,
// language, prescribing.
export function parseNeed(get: (k: string) => string | null, getAll: (k: string) => string[]) {
  const focusIds = getAll("focus").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const setting = get("setting");
  return {
    focusIds: Array.from(new Set(focusIds)).slice(0, 3),
    state: get("state") || null,
    city: get("city") || null,
    insurance: get("insurance") || null,
    ageBand: get("age") || null,
    setting: (setting === "virtual" || setting === "in_person" || setting === "either" ? setting : null) as
      | "virtual"
      | "in_person"
      | "either"
      | null,
    languageId: Number(get("language")) || null,
    prescribing: get("prescribing") === "1",
  };
}

export function needToQuery(need: ReturnType<typeof parseNeed>, extra: Record<string, string> = {}) {
  const q = new URLSearchParams();
  for (const f of need.focusIds) q.append("focus", String(f));
  if (need.state) q.set("state", need.state);
  if (need.city) q.set("city", need.city);
  if (need.insurance) q.set("insurance", need.insurance);
  if (need.ageBand) q.set("age", need.ageBand);
  if (need.setting) q.set("setting", need.setting);
  if (need.languageId) q.set("language", String(need.languageId));
  if (need.prescribing) q.set("prescribing", "1");
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}
