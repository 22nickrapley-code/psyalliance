import { US_STATES } from "@/lib/us-states";

const NAMES = new Map(US_STATES.map((s) => [s.code, s.name]));

export function stateName(code: string) {
  return NAMES.get(code) || code;
}

// "New York and Massachusetts", "New York, Massachusetts and Vermont"
export function stateList(codes: string[]) {
  const names = codes.map(stateName);
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export async function loadOpenStates(supabase: any): Promise<string[]> {
  const { data } = await supabase.from("open_states").select("state").eq("open", true).order("state");
  return (data || []).map((r: any) => r.state);
}
