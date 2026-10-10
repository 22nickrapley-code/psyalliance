import { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

// Trusted colleagues are chosen one way (migration 0107): a member adds a
// colleague, the way you'd count the people in your own group practice.
// No request, no acceptance. "Worked with before" builds itself, and
// PsyAlliance suggests the rest.

// Everyone this member has added as a trusted colleague.
export async function getTrustedIds(supabase: DB, me: string): Promise<Set<string>> {
  const { data } = await supabase.from("trusted_colleagues").select("colleague_id").eq("profile_id", me);
  return new Set((data || []).map((r: any) => r.colleague_id as string));
}

// Everyone who has added this member, for "added you" suggestions.
export async function getTrustedByIds(supabase: DB, me: string): Promise<Set<string>> {
  const { data } = await supabase.from("trusted_colleagues").select("profile_id").eq("colleague_id", me);
  return new Set((data || []).map((r: any) => r.profile_id as string));
}

export async function addTrusted(supabase: DB, me: string, colleagueId: string): Promise<{ error: string | null; added: boolean }> {
  if (!colleagueId || colleagueId === me) return { error: "Choose a colleague.", added: false };
  const { error } = await supabase.from("trusted_colleagues").insert({ profile_id: me, colleague_id: colleagueId });
  if (error) {
    if (error.code === "23505") return { error: null, added: false };
    return { error: error.message, added: false };
  }
  return { error: null, added: true };
}

export async function removeTrusted(supabase: DB, me: string, colleagueId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("trusted_colleagues").delete().eq("profile_id", me).eq("colleague_id", colleagueId);
  return { error: error?.message ?? null };
}
