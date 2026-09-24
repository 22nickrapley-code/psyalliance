import { createClient } from "@/lib/supabase/server";
import { US_STATES } from "@/lib/us-states";

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
};

export async function loadNeedOptions(supabase: Supabase): Promise<NeedOptions> {
  const { data } = await supabase
    .from("lookup_values")
    .select("id, category, value")
    .in("category", ["treatment_specialism", "insurance", "language", "age_group_specialism"])
    .order("value");
  const by = (c: string) => (data || []).filter((r: any) => r.category === c).map((r: any) => ({ id: Number(r.id), value: String(r.value) }));
  const ageOrder = ["Children", "Adolescents", "Young Adults", "Adults", "Seniors"];
  return {
    focus: by("treatment_specialism"),
    insurance: by("insurance"),
    language: by("language"),
    ageBands: by("age_group_specialism")
      .map((o) => o.value)
      .sort((a, b) => ageOrder.indexOf(a) - ageOrder.indexOf(b)),
    states: US_STATES,
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
