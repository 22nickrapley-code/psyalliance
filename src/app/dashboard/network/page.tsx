import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { findMatches } from "@/lib/match-engine";
import { US_STATES } from "@/lib/us-states";
import { effectiveReferral } from "@/lib/availability";
import { clinicianName } from "@/lib/profession";
import { IS_DEMO_SITE } from "@/lib/env";
import { loadNeedOptions } from "@/lib/need-options";
import { NetworkView, type NetworkTab, type Person, type Invitation } from "./views";

const PAGE_SIZE = 20;

export default async function NetworkPage(props: {
  searchParams: Promise<{ tab?: string; q?: string; focus?: string; state?: string; available?: string; profession?: string; insurance?: string; age?: string; language?: string; modality?: string; session?: string; psypact?: string; page?: string }>;
}) {
  const sp = await props.searchParams;
  const tab = (["directory", "trusted", "saved", "worked", "suggested"].includes(sp.tab || "") ? sp.tab : "directory") as NetworkTab;
  const filters = {
    q: (sp.q || "").trim(),
    focus: sp.focus || "",
    state: sp.state || "",
    available: sp.available === "1",
    profession: sp.profession || "",
    insurance: sp.insurance || "",
    age: sp.age || "",
    language: sp.language || "",
    modality: sp.modality || "",
    session: sp.session || "",
    psypact: sp.psypact === "1",
  };
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: connections }, { data: savedRows }, { data: workedRows }, { data: excludedRows }, { data: myProfile }, { data: myFocusRows }] =
    await Promise.all([
      supabase
        .from("connections")
        .select("id, requester_id, addressee_id, tier, status, requester:requester_id(full_name, credential_prefix, qualification_level, primary_practice_city, primary_state, avatar_path)")
        .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
      supabase.from("saved_clinicians").select("clinician_id").eq("profile_id", myself),
      supabase.from("worked_with_before").select("colleague_id").eq("profile_id", myself),
      supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself),
      supabase.rpc("my_profile").select("primary_state").maybeSingle<any>(),
      supabase
        .from("profile_lookup_values")
        .select("lookup_value_id, rank, lookup_values!inner(category)")
        .eq("profile_id", myself)
        .eq("lookup_values.category", "treatment_specialism")
        .order("rank"),
    ]);

  const saved = new Set((savedRows || []).map((s: any) => s.clinician_id as string));
  const worked = new Set((workedRows || []).map((w: any) => w.colleague_id as string));
  const excluded = (excludedRows || []).map((e: any) => e.blocked_profile_id as string);
  const trusted = new Set<string>();
  const pendingOut = new Set<string>();
  const pendingIn = new Set<string>();
  const invites: (Omit<Invitation, "avatarUrl"> & { avatarPath: string | null })[] = [];
  for (const c of connections || []) {
    const other = c.requester_id === myself ? c.addressee_id : c.requester_id;
    if (c.status === "accepted") trusted.add(other);
    else if (c.status === "pending") {
      if (c.requester_id === myself) pendingOut.add(other);
      else {
        pendingIn.add(other);
        const r: any = (c as any).requester;
        invites.push({
          id: c.id,
          profileId: other,
          name: clinicianName(r?.full_name, r?.qualification_level, r?.credential_prefix),
          where: [r?.primary_practice_city, r?.primary_state].filter(Boolean).join(", "),
          avatarPath: r?.avatar_path || null,
        });
      }
    }
  }

  // One database call returns this page of people, the total and the
  // filter options, however large the network grows.
  const only = tab === "trusted" ? [...trusted] : tab === "saved" ? [...saved] : tab === "worked" ? [...worked] : undefined;
  const { data: result } = await supabase.rpc("network_directory", {
    p: {
      ...filters,
      exclude: excluded,
      ...(only ? { only } : {}),
      first: [...trusted],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      with_options: true,
    },
  });
  const res = (result as any) || { total: 0, all: 0, people: [], options: {} };
  const rows: any[] = res.people || [];
  const urls = await resolveAvatarUrls(supabase, [...rows.map((p) => p.avatar_path), ...invites.map((i) => i.avatarPath)]);

  const people: Person[] = rows.map((p) => {
    const age = p.confirmed_at ? Math.floor((Date.now() - new Date(p.confirmed_at).getTime()) / 86_400_000) : null;
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
      name: clinicianName(p.full_name, p.qualification_level, p.credential_prefix),
      qualification: p.qualification_level,
      city: p.city,
      state: p.state,
      licenceStates: p.lic_states || [],
      topFocus: (p.focus || []).slice(0, 2),
      modalities: p.modalities || [],
      availability: effectiveReferral(p.referral_availability, p.confirmed_at, p.paused_until).label,
      fresh: !!p.fresh,
      confirmedDaysAgo: age,
      psypact: !!p.psypact,
      avatarUrl: urls.get(p.avatar_path || "") || null,
      relationship: rel,
      saved: saved.has(p.id),
    };
  });

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

  const opts = res.options || {};
  // On the demo, only offer focus areas every state covers well, so no
  // search comes back empty.
  if (IS_DEMO_SITE) {
    const covered = new Set((await loadNeedOptions(supabase)).focus.map((f) => f.value));
    if (covered.size) opts.focus = (opts.focus || []).filter((f: string) => covered.has(f));
  }
  const stateCodes: string[] = opts.states || [];
  const states = stateCodes.length ? US_STATES.filter((s) => stateCodes.includes(s.code)) : US_STATES;

  return (
    <NetworkView
      tab={tab}
      people={people}
      total={Number(res.total) || 0}
      page={page}
      pageSize={PAGE_SIZE}
      suggested={suggested}
      suggestedAvatars={suggestedAvatars}
      invitations={invites.map(({ avatarPath, ...i }) => ({ ...i, avatarUrl: urls.get(avatarPath || "") || null }))}
      sentCount={pendingOut.size}
      filters={filters}
      focusOptions={opts.focus || []}
      moreOptions={{ insurance: opts.insurance || [], age: opts.age || [], language: opts.language || [], modality: opts.modality || [], session: opts.session || [] }}
      states={states}
      counts={{ directory: Number(res.all) || 0, trusted: trusted.size, worked: worked.size, saved: saved.size, suggested: 0 }}
      networkSize={Number(res.all) || 0}
    />
  );
}
