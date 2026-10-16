import { clinicianName, roleLabel } from "@/lib/profession";
import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions, parseNeed } from "@/lib/need-options";
import { findMatches, assessColleague } from "@/lib/match-engine";
import { resolveAvatarUrls } from "@/lib/avatars";
import { ReferNeedView, ReferShortlistView, ReferReviewView, type DirectColleague } from "../views";

export const metadata = { title: "New referral" };

type SP = Record<string, string | string[] | undefined>;

// New referral: Need -> Shortlist -> Review. Criteria travel in the query
// string (they're non-identifying by design); the free-text note is only
// entered on the Review step and posted, never put in a URL.
export default async function NewReferralPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  };
  const getAll = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  const need = parseNeed(get, getAll);
  const step = get("step");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;
  const options = await loadNeedOptions(supabase);

  // "Refer a client" on a colleague's profile: a referral to that colleague.
  let to: DirectColleague | null = null;
  const toId = get("to");
  if (toId && /^[0-9a-f-]{36}$/i.test(toId) && toId !== myself) {
    const [{ data: rows }, { data: trusted }, { data: worked }] = await Promise.all([
      supabase.from("public_directory").select("id, full_name, credential_prefix, qualification_level, primary_practice_city, primary_state, avatar_path").eq("id", toId).limit(1),
      supabase.from("trusted_colleagues").select("colleague_id").eq("profile_id", myself).eq("colleague_id", toId).maybeSingle(),
      supabase.from("worked_with_before").select("colleague_id").eq("profile_id", myself).eq("colleague_id", toId).maybeSingle(),
    ]);
    const p: any = rows?.[0];
    if (p) {
      const urls = await resolveAvatarUrls(supabase, [p.avatar_path]);
      const name = clinicianName(p.full_name, p.qualification_level, p.credential_prefix);
      to = {
        id: p.id,
        name,
        first: String(p.full_name || "").replace(/^(dr\.?)\s+/i, "").split(/\s+/)[0] || "them",
        role: `${roleLabel(p.qualification_level)}${p.primary_practice_city ? ` · ${p.primary_practice_city}, ${p.primary_state}` : ""}`,
        avatarUrl: urls.get(p.avatar_path || "") || null,
        relation: trusted ? "Your trusted colleague" : worked ? "Worked with before" : null,
      };
    }
  }

  if ((step === "shortlist" || step === "review") && (need.focusIds.length === 0 || !need.state)) {
    return <ReferNeedView options={options} need={need} to={to} error={to ? "Choose a treatment focus and a state first." : "Choose a treatment focus and a state to see a shortlist."} />;
  }

  if (step === "shortlist") {
    let { matches, widen } = await findMatches(supabase, myself, { kind: "referral", ...need }, { limit: 12 });
    // From a colleague's profile: they come first, with any gaps said plainly.
    let pinned: { id: string; canAsk: boolean; gaps: string[] } | null = null;
    if (to) {
      const fit = await assessColleague(supabase, myself, to.id, { kind: "referral", ...need });
      if (fit) {
        pinned = { id: to.id, canAsk: fit.canAsk, gaps: fit.gaps };
        matches = [fit.match, ...matches.filter((m) => m.profileId !== to!.id)];
        widen = [];
      }
    }
    const urls = await resolveAvatarUrls(supabase, matches.map((m) => m.avatarPath));
    const avatarUrls = Object.fromEntries(matches.map((m) => [m.profileId, urls.get(m.avatarPath || "") || null]));
    const chosen = get("kept") === "1" ? getAll("pick").filter((id) => /^[0-9a-f-]{36}$/i.test(id)) : null;
    return <ReferShortlistView options={options} need={need} matches={matches} widen={widen} avatarUrls={avatarUrls} pinned={pinned} chosen={chosen} />;
  }

  if (step === "review" && to) {
    const fit = await assessColleague(supabase, myself, to.id, { kind: "referral", ...need });
    return (
      <ReferReviewView
        options={options}
        need={need}
        picked={[{ profileId: to.id, name: to.name }]}
        trustedCount={0}
        networkCount={0}
        direct={{ colleague: to, fit }}
        error={get("error") || undefined}
      />
    );
  }

  if (step === "review") {
    const picks = getAll("pick");
    const [{ data: pickedRows }, { count: trustedCount }, { data: networkCount }] = await Promise.all([
      picks.length
        ? supabase.from("profiles").select("id, full_name, credential_prefix").in("id", picks)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("trusted_colleagues").select("colleague_id", { count: "exact", head: true }).eq("profile_id", myself),
      supabase.rpc("eligible_network_count"),
    ]);
    const picked = (pickedRows || []).map((p: any) => ({
      profileId: p.id,
      name: clinicianName(p?.full_name, p?.qualification_level, p?.credential_prefix),
    }));
    return (
      <ReferReviewView
        options={options}
        need={need}
        picked={picked}
        trustedCount={trustedCount || 0}
        networkCount={Number(networkCount) || 0}
        error={get("error") || undefined}
      />
    );
  }

  return <ReferNeedView options={options} need={need} to={to} error={get("error") || undefined} />;
}
