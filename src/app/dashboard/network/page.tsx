import { redirect } from "next/navigation";
import { loadInvite } from "@/lib/invite";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { findMatches } from "@/lib/match-engine";
import { clinicianName } from "@/lib/profession";
import { getTrustedIds, getTrustedByIds } from "@/lib/trusted";
import { cliniciansHref } from "../clinicians/views";
import { NetworkView, type Colleague } from "./views";
import type { CircleNode } from "../_components/orbit";

export const metadata = { title: "Your network" };

const SEARCH_KEYS = ["q", "focus", "state", "available", "profession", "insurance", "age", "language", "modality", "session", "psypact", "page"];

// Your network: the people you've chosen as trusted colleagues, the ones
// you've worked with, and the colleagues PsyAlliance suggests, drawn as a
// circle around you. Searching everyone lives in Clinicians.
export default async function NetworkPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await props.searchParams;
  // Older links to a Network search open the same search in Clinicians.
  if (SEARCH_KEYS.some((k) => sp[k] !== undefined) || sp.tab === "directory") {
    const f: Record<string, string> = {};
    for (const k of SEARCH_KEYS) if (sp[k] && k !== "page") f[k] = sp[k]!;
    redirect(cliniciansHref(f as any, Number(sp.page) || 1));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;

  const [trusted, trustedBy, { data: workedRows }, { data: myProfile }, { data: myFocusRows }, invite] = await Promise.all([
    getTrustedIds(supabase, me),
    getTrustedByIds(supabase, me),
    supabase.from("worked_with_before").select("colleague_id, interaction_count").eq("profile_id", me),
    supabase.rpc("my_profile").select("primary_state, full_name, avatar_path").maybeSingle<any>(),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, rank, lookup_values!inner(category)")
      .eq("profile_id", me)
      .eq("lookup_values.category", "treatment_specialism")
      .order("rank"),
    loadInvite(supabase),
  ]);
  const worked = new Map<string, number>((workedRows || []).map((w: any) => [w.colleague_id as string, Number(w.interaction_count) || 1]));

  // Suggested: people who added you first, then the best matches for your
  // practice that aren't already trusted.
  const addedYou = [...trustedBy].filter((id) => !trusted.has(id));
  const { matches } = await findMatches(
    supabase,
    me,
    { kind: "discovery", focusIds: (myFocusRows || []).slice(0, 3).map((r: any) => Number(r.lookup_value_id)), state: myProfile?.primary_state || null },
    { exclude: [...trusted, ...addedYou, ...worked.keys()], limit: 10 }
  );

  const ids = Array.from(new Set([...trusted, ...worked.keys(), ...addedYou]));
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, full_name, credential_prefix, qualification_level, primary_practice_city, primary_state, avatar_path").in("id", ids)
    : { data: [] as any[] };
  const byId = new Map((people || []).map((p: any) => [p.id as string, p]));
  const urls = await resolveAvatarUrls(supabase, [...(people || []).map((p: any) => p.avatar_path), ...matches.map((m) => m.avatarPath), myProfile?.avatar_path]);

  const toColleague = (id: string, why: string): Colleague | null => {
    const p: any = byId.get(id);
    if (!p) return null;
    return {
      id,
      name: clinicianName(p.full_name, p.qualification_level, p.credential_prefix),
      where: [p.primary_practice_city, p.primary_state].filter(Boolean).join(", "),
      avatarUrl: urls.get(p.avatar_path || "") || null,
      why,
      trusted: trusted.has(id),
    };
  };
  const trustedList = [...trusted].map((id) => toColleague(id, worked.has(id) ? "Trusted · worked together" : "Trusted colleague")).filter(Boolean) as Colleague[];
  // Worked with before, apart from people already trusted (their row in
  // Trusted says "worked together"), so nobody is listed twice.
  const workedList = [...worked.entries()]
    .filter(([id]) => !trusted.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => toColleague(id, `${n} referral${n === 1 ? "" : "s"}, cover or consult${n === 1 ? "" : "s"} together`))
    .filter(Boolean) as Colleague[];
  const suggestedList: Colleague[] = [
    ...(addedYou.map((id) => toColleague(id, "Added you as a trusted colleague")).filter(Boolean) as Colleague[]),
    ...matches.map((m) => ({
      id: m.profileId,
      name: clinicianName(m.fullName, m.qualification, m.credentialPrefix),
      where: [m.city, m.state].filter(Boolean).join(", "),
      avatarUrl: urls.get(m.avatarPath || "") || null,
      why: m.reasons.filter((r) => r !== "Worked together before").slice(0, 2).join(" · ") || "Fits your practice",
      trusted: false,
    })),
  ].slice(0, 10);

  const nodes: CircleNode[] = [
    ...trustedList.map((c) => ({ id: c.id, name: c.name, kind: "trusted" as const, avatarUrl: c.avatarUrl })),
    ...workedList.map((c) => ({ id: c.id, name: c.name, kind: "worked" as const, avatarUrl: c.avatarUrl })),
    ...suggestedList.map((c) => ({ id: c.id, name: c.name, kind: "suggested" as const, avatarUrl: c.avatarUrl })),
  ];
  const myInitials = String(myProfile?.full_name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase())
    .join("");

  return (
    <NetworkView
      trusted={trustedList}
      worked={workedList}
      suggested={suggestedList}
      nodes={nodes}
      me={{ initials: myInitials || "You", avatarUrl: urls.get(myProfile?.avatar_path || "") || null }}
      note={sp.trusted ? "Added as a trusted colleague. They've been told, and they come first in your matches." : sp.untrusted ? "Removed from your trusted colleagues. They aren't told." : null}
      error={sp.error || null}
      invite={invite}
      ranked={(myFocusRows || []).length > 0}
    />
  );
}
