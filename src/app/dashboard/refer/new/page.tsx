import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions, parseNeed } from "@/lib/need-options";
import { findMatches } from "@/lib/match-engine";
import { resolveAvatarUrls } from "@/lib/avatars";
import { ReferNeedView, ReferShortlistView, ReferReviewView } from "../views";

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

  if ((step === "shortlist" || step === "review") && (need.focusIds.length === 0 || !need.state)) {
    return <ReferNeedView options={options} need={need} error="Choose a treatment focus and a state to see a shortlist." />;
  }

  if (step === "shortlist") {
    const { matches, widen } = await findMatches(supabase, myself, { kind: "referral", ...need }, { limit: 12 });
    const urls = await resolveAvatarUrls(supabase, matches.map((m) => m.avatarPath));
    const avatarUrls = Object.fromEntries(matches.map((m) => [m.profileId, urls.get(m.avatarPath || "") || null]));
    return <ReferShortlistView options={options} need={need} matches={matches} widen={widen} avatarUrls={avatarUrls} />;
  }

  if (step === "review") {
    const picks = getAll("pick");
    const [{ data: pickedRows }, { count: trustedCount }, { data: networkCount }] = await Promise.all([
      picks.length
        ? supabase.from("profiles").select("id, full_name, credential_prefix").in("id", picks)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("connections")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted")
        .eq("tier", "trusted_colleague")
        .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
      supabase.rpc("eligible_network_count"),
    ]);
    const picked = (pickedRows || []).map((p: any) => ({
      profileId: p.id,
      name: `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}`,
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

  return <ReferNeedView options={options} need={need} error={get("error") || undefined} />;
}
