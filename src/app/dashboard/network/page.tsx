import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { findMatches } from "@/lib/match-engine";
import { professionFor } from "@/lib/profession";
import { US_STATES } from "@/lib/us-states";
import { NetworkView, type NetworkTab, type Person } from "./views";

const AVAIL: Record<string, string> = { yes: "Accepting referrals", limited: "Selected referrals", no: "Not accepting" };

export default async function NetworkPage(props: {
  searchParams: Promise<{ tab?: string; q?: string; focus?: string; state?: string; available?: string; profession?: string }>;
}) {
  const sp = await props.searchParams;
  const tab = (["directory", "trusted", "saved", "worked", "suggested"].includes(sp.tab || "") ? sp.tab : "directory") as NetworkTab;
  const filters = {
    q: (sp.q || "").trim(),
    focus: sp.focus || "",
    state: sp.state || "",
    available: sp.available === "1",
    profession: sp.profession || "",
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: rows }, { data: licenceRows }, { data: connections }, { data: savedRows }, { data: workedRows }, { data: excludedRows }, { data: myProfile }, { data: myFocusRows }] =
    await Promise.all([
      supabase.from("public_directory").select("*").neq("id", myself),
      supabase.rpc("network_licence_states"),
      supabase
        .from("connections")
        .select("id, requester_id, addressee_id, tier, status, requester:requester_id(full_name, credential_prefix)")
        .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
      supabase.from("saved_clinicians").select("clinician_id").eq("profile_id", myself),
      supabase.from("worked_with_before").select("colleague_id").eq("profile_id", myself),
      supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself),
      supabase.from("profiles").select("primary_state").eq("id", myself).maybeSingle(),
      supabase
        .from("profile_lookup_values")
        .select("lookup_value_id, rank, lookup_values!inner(category)")
        .eq("profile_id", myself)
        .eq("lookup_values.category", "treatment_specialism")
        .order("rank"),
    ]);

  const licences = new Map<string, string[]>(((licenceRows as any[]) || []).map((r) => [r.profile_id, r.states || []]));
  const saved = new Set((savedRows || []).map((s: any) => s.clinician_id));
  const worked = new Set((workedRows || []).map((w: any) => w.colleague_id));
  const excluded = new Set((excludedRows || []).map((e: any) => e.blocked_profile_id));
  const trusted = new Set<string>();
  const pendingOut = new Set<string>();
  const pendingIn = new Set<string>();
  const invitations: { id: number; name: string; profileId: string }[] = [];
  for (const c of connections || []) {
    const other = c.requester_id === myself ? c.addressee_id : c.requester_id;
    if (c.status === "accepted") trusted.add(other);
    else if (c.status === "pending") {
      if (c.requester_id === myself) pendingOut.add(other);
      else {
        pendingIn.add(other);
        const r: any = (c as any).requester;
        invitations.push({ id: c.id, profileId: other, name: r ? `${r.credential_prefix ? r.credential_prefix + " " : ""}${r.full_name}` : "A colleague" });
      }
    }
  }

  // One entry per person from the directory view (one row per lookup value).
  const byId = new Map<string, any>();
  for (const r of rows || []) {
    let p = byId.get(r.id);
    if (!p) {
      p = { ...r, focus: [] as { v: string; rank: number | null }[] };
      byId.set(r.id, p);
    }
    if (r.category === "treatment_specialism") p.focus.push({ v: r.value, rank: r.rank });
  }
  const urls = await resolveAvatarUrls(supabase, Array.from(byId.values()).map((p) => p.avatar_path));

  let people: Person[] = Array.from(byId.values())
    .filter((p) => !excluded.has(p.id))
    .map((p) => {
      const age = p.availability_confirmed_at ? Math.floor((Date.now() - new Date(p.availability_confirmed_at).getTime()) / 86_400_000) : null;
      const rel: Person["relationship"] = trusted.has(p.id)
        ? "trusted"
        : pendingIn.has(p.id)
          ? "pending_in"
          : pendingOut.has(p.id)
            ? "pending_out"
            : worked.has(p.id)
              ? "worked_with"
              : saved.has(p.id)
                ? "saved"
                : "none";
      return {
        id: p.id,
        name: `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}`,
        qualification: p.qualification_level,
        city: p.primary_practice_city,
        state: p.primary_state,
        licenceStates: licences.get(p.id) || [],
        topFocus: p.focus
          .sort((a: any, b: any) => (a.rank ?? 99) - (b.rank ?? 99))
          .slice(0, 3)
          .map((f: any) => f.v),
        availability: AVAIL[p.referral_availability] || "Availability not set",
        fresh: p.referral_availability === "yes" && age !== null && age <= 30,
        confirmedDaysAgo: age,
        psypact: !!p.psypact_participating,
        avatarUrl: urls.get(p.avatar_path || "") || null,
        relationship: rel,
        saved: saved.has(p.id),
        _all: p.focus.map((f: any) => f.v.toLowerCase()),
      } as Person & { _all: string[] };
    });

  const counts: Record<NetworkTab, number> = {
    directory: people.length,
    trusted: people.filter((p) => p.relationship === "trusted").length,
    worked: people.filter((p) => worked.has(p.id)).length,
    saved: people.filter((p) => p.saved).length,
    suggested: 0,
  };

  if (tab === "trusted") people = people.filter((p) => p.relationship === "trusted");
  if (tab === "saved") people = people.filter((p) => p.saved);
  if (tab === "worked") people = people.filter((p) => worked.has(p.id));
  const q = filters.q.toLowerCase();
  if (q) people = people.filter((p: any) => p.name.toLowerCase().includes(q) || p._all.some((f: string) => f.includes(q)));
  if (filters.focus) people = people.filter((p: any) => p._all.includes(filters.focus.toLowerCase()));
  if (filters.state) people = people.filter((p) => p.licenceStates.includes(filters.state) || p.state === filters.state);
  if (filters.available) people = people.filter((p) => p.fresh);
  if (filters.profession) people = people.filter((p) => professionFor(p.qualification) === filters.profession);
  people.sort((a, b) => Number(b.relationship === "trusted") - Number(a.relationship === "trusted") || Number(b.fresh) - Number(a.fresh) || a.name.localeCompare(b.name));

  let suggested: any[] = [];
  let suggestedAvatars: Record<string, string | null> = {};
  if (tab === "suggested") {
    const { matches } = await findMatches(
      supabase,
      myself,
      { kind: "discovery", focusIds: (myFocusRows || []).slice(0, 3).map((r: any) => Number(r.lookup_value_id)), state: myProfile?.primary_state || null },
      { exclude: [...trusted, ...saved, ...pendingOut], limit: 12 }
    );
    suggested = matches;
    const u = await resolveAvatarUrls(supabase, matches.map((m) => m.avatarPath));
    suggestedAvatars = Object.fromEntries(matches.map((m) => [m.profileId, u.get(m.avatarPath || "") || null]));
  }

  const focusOptions = Array.from(new Set(Array.from(byId.values()).flatMap((p) => p.focus.map((f: any) => f.v)))).sort();

  return (
    <NetworkView
      tab={tab}
      people={people}
      suggested={suggested}
      suggestedAvatars={suggestedAvatars}
      invitations={invitations}
      sentCount={pendingOut.size}
      filters={filters}
      focusOptions={focusOptions}
      states={US_STATES}
      counts={counts}
    />
  );
}
