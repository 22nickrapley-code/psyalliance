import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { clinicianName } from "@/lib/profession";
import { effectiveReferral } from "@/lib/availability";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SuggestionGroup = "recent" | "trusted" | "worked" | "saved" | "network";

export type Suggestion = {
  id: string;
  name: string;
  avatarUrl: string | null;
  where: string;
  group: SuggestionGroup;
  // Why this person is suggested, in a few words.
  reason: string;
  focus: string[];
  trusted?: boolean;
};

const shortDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

// The people a member is most likely to want, in the order they'd look:
// whoever they've been talking to, their trusted colleagues, then
// colleagues they've worked with. Each person appears once, under the
// strongest reason.
export async function loadColleagueSuggestions(supabase: Supabase, myself: string, include?: string | null): Promise<Suggestion[]> {
  const [{ data: parts }, { data: conns }, { data: worked }, { data: saved }] = await Promise.all([
    supabase.from("conversation_participants").select("conversation_id, conversation:conversation_id(last_message_at)").eq("profile_id", myself),
    supabase.from("trusted_colleagues").select("colleague_id").eq("profile_id", myself),
    supabase.from("worked_with_before").select("colleague_id").eq("profile_id", myself),
    Promise.resolve({ data: [] as any[] }),
  ]);

  // Recent: the other person in my latest one-to-one conversations.
  const convIds = (parts || [])
    .sort((a: any, b: any) => String(b.conversation?.last_message_at || "").localeCompare(String(a.conversation?.last_message_at || "")))
    .slice(0, 12)
    .map((p: any) => p.conversation_id);
  const lastAt = new Map<number, string>((parts || []).map((p: any) => [p.conversation_id, p.conversation?.last_message_at]));
  const { data: others } = convIds.length
    ? await supabase.from("conversation_participants").select("conversation_id, profile_id").in("conversation_id", convIds).neq("profile_id", myself)
    : { data: [] as any[] };
  const perConv = new Map<number, string[]>();
  for (const o of others || []) perConv.set(o.conversation_id, [...(perConv.get(o.conversation_id) || []), o.profile_id]);
  const recent = new Map<string, string>();
  for (const id of convIds) {
    const people = perConv.get(id) || [];
    if (people.length === 1 && !recent.has(people[0])) recent.set(people[0], lastAt.get(id) || "");
  }

  const trusted = new Set((conns || []).map((c: any) => c.colleague_id as string));
  const workedSet = new Set((worked || []).map((w: any) => w.colleague_id as string));
  const savedSet = new Set((saved || []).map((s: any) => s.clinician_id as string));
  const ids = Array.from(new Set([...recent.keys(), ...trusted, ...workedSet, ...savedSet, ...(include ? [include] : [])])).slice(0, 80);
  if (!ids.length) return [];

  const [{ data: profiles }, { data: focusRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, credential_prefix, qualification_level, avatar_path, primary_practice_city, primary_state, referral_availability, availability_confirmed_at, availability_paused_until")
      .in("id", ids),
    supabase.from("profile_lookup_values").select("profile_id, rank, lookup:lookup_value_id(value, category)").in("profile_id", ids).not("rank", "is", null).order("rank"),
  ]);
  const focus = new Map<string, string[]>();
  for (const f of focusRows || []) {
    const v = (f as any).lookup;
    if (v?.category !== "treatment_specialism") continue;
    focus.set(f.profile_id, [...(focus.get(f.profile_id) || []), v.value].slice(0, 2));
  }
  const urls = await resolveAvatarUrls(supabase, (profiles || []).map((p: any) => p.avatar_path));
  const byId = new Map((profiles || []).map((p: any) => [p.id as string, p]));

  const out: Suggestion[] = [];
  const add = (id: string, group: SuggestionGroup, reason: string) => {
    const p: any = byId.get(id);
    if (!p || out.some((s) => s.id === id)) return;
    const avail = effectiveReferral(p.referral_availability, p.availability_confirmed_at, p.availability_paused_until);
    out.push({
      id,
      name: clinicianName(p.full_name, p.qualification_level, p.credential_prefix),
      avatarUrl: urls.get(p.avatar_path || "") || null,
      where: [p.primary_practice_city, p.primary_state].filter(Boolean).join(", "),
      group,
      reason: [reason, avail.open ? avail.label : null].filter(Boolean).join(" · "),
      focus: focus.get(id) || [],
      trusted: trusted.has(id),
    });
  };
  if (include) add(include, trusted.has(include) ? "trusted" : "network", trusted.has(include) ? "Trusted colleague" : "From their profile");
  for (const [id, at] of recent) add(id, "recent", `${trusted.has(id) ? "Trusted · " : ""}Last message ${shortDate(at)}`);
  for (const id of trusted) add(id, "trusted", "Trusted colleague");
  for (const id of workedSet) add(id, "worked", "Worked with before");
  for (const id of savedSet) add(id, "saved", "Saved");
  return out;
}
