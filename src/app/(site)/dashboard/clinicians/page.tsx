import { createClient } from "@/lib/supabase/server";
import { loadInvite } from "@/lib/invite";
import { resolveAvatarUrls } from "@/lib/avatars";
import { US_STATES } from "@/lib/us-states";
import { effectiveReferral } from "@/lib/availability";
import { clinicianName } from "@/lib/profession";
import { IS_DEMO_SITE } from "@/lib/env";
import { loadNeedOptions } from "@/lib/need-options";
import { getTrustedIds } from "@/lib/trusted";
import { CliniciansView, type Person, type Filters } from "./views";

export const metadata = { title: "Clinicians" };

const PAGE_SIZE = 20;

export default async function CliniciansPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await props.searchParams;
  // Everyone, no filters, until the member chooses some.
  const filters: Filters = {
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

  const [trusted, { data: workedRows }, { data: excludedRows }, invite] = await Promise.all([
    getTrustedIds(supabase, myself),
    supabase.from("worked_with_before").select("colleague_id").eq("profile_id", myself),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", myself),
    loadInvite(supabase),
  ]);
  const worked = new Set((workedRows || []).map((w: any) => w.colleague_id as string));
  const excluded = (excludedRows || []).map((e: any) => e.blocked_profile_id as string);

  const { data: result } = await supabase.rpc("network_directory", {
    p: {
      ...filters,
      exclude: excluded,
      first: [...trusted, ...worked],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      with_options: true,
    },
  });
  const res = (result as any) || { total: 0, all: 0, people: [], options: {} };
  const rows: any[] = (res.people || []).filter((p: any) => p.id !== myself);
  const urls = await resolveAvatarUrls(supabase, rows.map((p) => p.avatar_path));

  const people: Person[] = rows.map((p) => {
    const age = p.confirmed_at ? Math.floor((Date.now() - new Date(p.confirmed_at).getTime()) / 86_400_000) : null;
    return {
      id: p.id,
      name: clinicianName(p.full_name, p.qualification_level, p.credential_prefix),
      qualification: p.qualification_level,
      city: p.city,
      state: p.state,
      licenceStates: p.lic_states || [],
      // When filtering by a specialty, the card leads with it.
      topFocus: (() => {
        const all: string[] = p.focus || [];
        const hit = filters.focus ? all.find((f) => f.toLowerCase() === filters.focus.toLowerCase()) : undefined;
        return hit ? [hit, ...all.filter((f) => f !== hit)].slice(0, 2) : all.slice(0, 2);
      })(),
      modalities: p.modalities || [],
      availability: effectiveReferral(p.referral_availability, p.confirmed_at, p.paused_until).label,
      fresh: !!p.fresh,
      confirmedDaysAgo: age,
      psypact: !!p.psypact,
      avatarUrl: urls.get(p.avatar_path || "") || null,
      relationship: trusted.has(p.id) ? "trusted" : worked.has(p.id) ? "worked_with" : "none",
    };
  });

  const opts = res.options || {};
  // On the demo, only offer focus areas every state covers well.
  if (IS_DEMO_SITE) {
    const covered = new Set((await loadNeedOptions(supabase)).focus.map((f) => f.value));
    if (covered.size) opts.focus = (opts.focus || []).filter((f: string) => covered.has(f));
  }
  const stateCodes: string[] = opts.states || [];
  const states = stateCodes.length ? US_STATES.filter((s) => stateCodes.includes(s.code)) : US_STATES;

  return (
    <CliniciansView
      people={people}
      total={Number(res.total) || 0}
      page={page}
      pageSize={PAGE_SIZE}
      filters={filters}
      focusOptions={opts.focus || []}
      moreOptions={{ insurance: opts.insurance || [], age: opts.age || [], language: opts.language || [], modality: opts.modality || [], session: opts.session || [] }}
      states={states}
      networkSize={Number(res.all) || 0}
      note={sp.trusted ? "Added as a trusted colleague. They come first in your matches, and they've been told." : null}
      error={sp.error || null}
      invite={invite}
    />
  );
}
