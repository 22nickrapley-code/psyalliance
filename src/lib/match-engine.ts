import { createClient } from "@/lib/supabase/server";

// The shared matching engine (Product Spec v1, "The matching engine").
// One engine ranks colleagues for Refer, Cover, the Home quick search,
// Supervision and Suggested for you, in four stages:
//   1. hard filters   - who may appear at all
//   2. fit score      - how well their practice matches the need
//   3. relationship   - your own circle first (large boost, not absolute)
//   4. freshness      - recently confirmed availability ranks normally
// Every result carries plain-language reasons: facts on file, never a
// judgement that someone is "eligible" for a patient.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type MatchKind = "referral" | "cover" | "supervision" | "discovery";
export type Setting = "virtual" | "in_person" | "either";

export type MatchNeed = {
  kind: MatchKind;
  focusIds?: number[];
  state?: string | null;
  city?: string | null;
  insurance?: string | null;
  ageBand?: string | null;
  setting?: Setting | null;
  languageId?: number | null;
  prescribing?: boolean;
};

export type RelationshipTier = "trusted" | "worked_with" | "saved" | "none";
export type Freshness = "fresh" | "stale" | "unconfirmed";

export type Match = {
  profileId: string;
  fullName: string;
  credentialPrefix: string | null;
  qualification: string | null;
  city: string | null;
  state: string | null;
  avatarPath: string | null;
  score: number;
  tier: RelationshipTier;
  freshness: Freshness;
  availabilityLabel: string;
  confirmedDaysAgo: number | null;
  reasons: string[];
};

export type MatchResult = {
  matches: Match[];
  // Plain suggestions for widening when nothing (or very little) matches.
  widen: { key: string; label: string }[];
};

const PRESCRIBER_QUALIFICATIONS = new Set(["MD", "DO"]);
const FRESH_DAYS = 30;
const DROP_DAYS = 90;

function focusPoints(rank: number | null) {
  if (rank === 1) return 10;
  if (rank === 2) return 8;
  if (rank === 3) return 4;
  return 2;
}

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function pausedUntil(p: any): string | null {
  const d = p.availability_paused_until as string | null;
  return d && d >= new Date().toISOString().slice(0, 10) ? d : null;
}

function availabilityFor(kind: MatchKind, p: any): { value: string | null; label: string } {
  // A pause-until date closes referrals and cover until that day, whatever
  // the statuses say (Product Spec v1, Availability).
  const paused = pausedUntil(p);
  if (paused && (kind === "cover" || kind === "referral")) {
    return { value: "no", label: `Paused until ${new Date(paused + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` };
  }
  if (kind === "cover") {
    const v = p.coverage_availability as string | null;
    return { value: v, label: v === "yes" ? "Available for cover" : v === "ask_me" ? "Cover: ask me" : v === "no" ? "Not available for cover" : "Cover availability not set" };
  }
  if (kind === "supervision") {
    return { value: p.open_to_give_supervision ? "yes" : "no", label: p.open_to_give_supervision ? "Open to supervise" : "Not supervising" };
  }
  const v = p.referral_availability as string | null;
  return { value: v, label: v === "yes" ? "Accepting referrals" : v === "limited" ? "Selected referrals only" : v === "no" ? "Not accepting referrals" : "Referral availability not set" };
}

export async function findMatches(
  supabase: Supabase,
  requesterId: string,
  need: MatchNeed,
  opts: { exclude?: string[]; limit?: number } = {}
): Promise<MatchResult> {
  const needState = need.state ? need.state.trim().toUpperCase() : null;
  const needCity = need.city ? need.city.trim().toLowerCase() : null;
  const focusIds = (need.focusIds || []).filter((n) => Number.isFinite(n) && n > 0);
  const allowsTelehealth = need.setting === "virtual" || need.setting === "either" || !need.setting;

  const [
    { data: licenceRows },
    { data: candidates },
    { data: connectionRows },
    { data: savedRows },
    { data: workedRows },
    { data: ratingRows },
    { data: blockRows },
  ] = await Promise.all([
    supabase.rpc("network_licence_states"),
    supabase
      .from("profiles")
      .select(
        "id, full_name, credential_prefix, qualification_level, primary_state, primary_practice_city, psypact_participating, referral_availability, coverage_availability, availability_confirmed_at, availability_paused_until, approx_spaces, last_active_at, open_to_give_supervision, avatar_path"
      )
      .eq("verification_status", "verified")
      .eq("account_status", "active")
      .eq("is_demo", false)
      .neq("id", requesterId),
    supabase
      .from("connections")
      .select("requester_id, addressee_id, tier")
      .eq("status", "accepted")
      .or(`requester_id.eq.${requesterId},addressee_id.eq.${requesterId}`),
    supabase.from("saved_clinicians").select("clinician_id").eq("profile_id", requesterId),
    supabase.from("worked_with_before").select("colleague_id, interaction_count").eq("profile_id", requesterId),
    supabase.from("collaboration_ratings").select("colleague_profile_id, would_work_again").eq("rater_profile_id", requesterId),
    supabase.from("do_not_work_with").select("blocked_profile_id").eq("profile_id", requesterId),
  ]);

  const licenceStates = new Map<string, Set<string>>();
  for (const r of (licenceRows as any[]) || []) licenceStates.set(r.profile_id, new Set(r.states || []));

  const excluded = new Set<string>([...(opts.exclude || []), ...((blockRows || []).map((b: any) => b.blocked_profile_id))]);

  const trusted = new Set<string>();
  const saved = new Set<string>((savedRows || []).map((s: any) => s.clinician_id));
  for (const c of connectionRows || []) {
    const other = c.requester_id === requesterId ? c.addressee_id : c.requester_id;
    if (c.tier === "trusted_colleague" || c.tier === "partner") trusted.add(other);
    else if (c.tier === "bench") saved.add(other); // Bench is Saved, same weight
  }
  const worked = new Map<string, number>((workedRows || []).map((w: any) => [w.colleague_id, Number(w.interaction_count) || 0]));
  const wouldWorkAgain = new Map<string, boolean>();
  for (const r of ratingRows || []) {
    // Any "no" wins over earlier "yes" ratings for the same colleague.
    if (wouldWorkAgain.get(r.colleague_profile_id) !== false) wouldWorkAgain.set(r.colleague_profile_id, r.would_work_again);
  }

  // Stage 1: hard filters that need only the profile row.
  type Pre = { p: any; telehealthOnly: boolean; states: Set<string> };
  const pre: Pre[] = [];
  for (const p of candidates || []) {
    if (excluded.has(p.id)) continue;
    const states = licenceStates.get(p.id);
    if (!states || states.size === 0) continue; // no active licence on record
    let telehealthOnly = false;
    if (needState && !states.has(needState)) {
      if (allowsTelehealth && p.psypact_participating) telehealthOnly = true;
      else continue;
    }
    if (need.prescribing && !PRESCRIBER_QUALIFICATIONS.has(String(p.qualification_level))) continue;
    const avail = availabilityFor(need.kind, p);
    if (need.kind !== "discovery" && avail.value === "no") continue;
    const age = daysSince(p.availability_confirmed_at);
    if ((need.kind === "referral" || need.kind === "cover") && age !== null && age > DROP_DAYS) continue;
    pre.push({ p, telehealthOnly, states });
  }

  if (pre.length === 0) return { matches: [], widen: widenOptions(need) };

  // Practice facts for the remaining candidates.
  const ids = pre.map((x) => x.p.id);
  const { data: lookupRows } = await supabase
    .from("profile_lookup_values")
    .select("profile_id, rank, lookup_value_id, lookup_values!inner(category, value)")
    .in("profile_id", ids);
  const facts = new Map<string, { focus: Map<number, number | null>; values: Map<string, Set<string>>; languageIds: Set<number> }>();
  for (const r of (lookupRows as any[]) || []) {
    let f = facts.get(r.profile_id);
    if (!f) {
      f = { focus: new Map(), values: new Map(), languageIds: new Set() };
      facts.set(r.profile_id, f);
    }
    const cat = r.lookup_values?.category as string;
    const val = r.lookup_values?.value as string;
    if (cat === "treatment_specialism") f.focus.set(Number(r.lookup_value_id), r.rank ?? null);
    if (cat === "language") f.languageIds.add(Number(r.lookup_value_id));
    if (!f.values.has(cat)) f.values.set(cat, new Set());
    f.values.get(cat)!.add(String(val).toLowerCase());
  }

  const focusNames = new Map<number, string>();
  if (focusIds.length > 0) {
    const { data: names } = await supabase.from("lookup_values").select("id, value").in("id", focusIds);
    for (const n of names || []) focusNames.set(Number(n.id), n.value);
  }

  const results: Match[] = [];
  for (const { p, telehealthOnly } of pre) {
    const f = facts.get(p.id) || { focus: new Map(), values: new Map(), languageIds: new Set<number>() };
    const reasons: string[] = [];
    let score = 0;

    // Relationship first in the reasons list, because members scan it first.
    let tier: RelationshipTier = "none";
    if (trusted.has(p.id)) {
      tier = "trusted";
      score += 40;
      reasons.push("Trusted colleague");
    } else if (worked.has(p.id)) {
      tier = "worked_with";
      score += 25;
      reasons.push("Worked together before");
    } else if (saved.has(p.id)) {
      tier = "saved";
      score += 15;
      reasons.push("Saved clinician");
    }
    if (worked.has(p.id)) score += Math.min(15, (worked.get(p.id)! - 1) * 5);
    if (wouldWorkAgain.get(p.id) === false) score -= 30;
    if (tier === "trusted" && worked.has(p.id)) reasons.push("Worked together before");

    // Stage 2: fit.
    if (focusIds.length > 0) {
      const matched = focusIds.filter((id) => f.focus.has(id));
      if (matched.length === 0) continue; // clinically irrelevant for this need
      const best = matched.reduce((acc, id) => Math.max(acc, focusPoints(f.focus.get(id) ?? null)), 0);
      score += best + 3 * (matched.length - 1);
      const top = matched.find((id) => f.focus.get(id) === 1);
      if (top) reasons.push(`${focusNames.get(top) || "This focus"} is their top specialty`);
      else reasons.push(`Works with ${matched.map((id) => focusNames.get(id)).filter(Boolean).join(", ") || "this focus"}`);
    }

    const city = (p.primary_practice_city || "").trim().toLowerCase();
    if (telehealthOnly) {
      score += 4;
      reasons.push("PSYPACT telehealth");
    } else if (needCity && city && city === needCity) {
      score += 8;
      reasons.push(`Practises in ${p.primary_practice_city}`);
    } else if (needState) {
      score += 6;
    }
    if (needState && !telehealthOnly) reasons.push(`${needState} licence on file`);
    if (need.setting === "in_person" && telehealthOnly) continue;

    if (need.insurance && need.insurance.toLowerCase() !== "self-pay") {
      if (f.values.get("insurance")?.has(need.insurance.toLowerCase())) {
        score += 6;
        reasons.push(`In network: ${need.insurance}`);
      }
    }
    if (need.ageBand && f.values.get("age_group_specialism")?.has(need.ageBand.toLowerCase())) {
      score += 5;
      reasons.push(`Sees ${need.ageBand.toLowerCase()}`);
    }
    if (need.setting && need.setting !== "either") {
      const want = need.setting === "virtual" ? "virtual" : "face to face";
      if (f.values.get("session_type")?.has(want)) {
        score += 3;
        reasons.push(need.setting === "virtual" ? "Offers virtual sessions" : "Offers in-person sessions");
      }
    }
    if (need.languageId && f.languageIds.has(need.languageId)) {
      score += 5;
      reasons.push("Speaks the requested language");
    }

    // Stage 4: freshness.
    const avail = availabilityFor(need.kind, p);
    const age = daysSince(p.availability_confirmed_at);
    let freshness: Freshness = "unconfirmed";
    if (age !== null && age <= FRESH_DAYS) freshness = "fresh";
    else if (age !== null) freshness = "stale";
    if (need.kind !== "discovery") {
      if (freshness === "stale") score -= 10;
      if (freshness === "unconfirmed") score -= 15;
      if (avail.value === "limited" || avail.value === "ask_me") score -= 3;
      reasons.push(
        freshness === "fresh"
          ? `${avail.label}, confirmed ${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}`
          : freshness === "stale"
            ? `${avail.label}, not recently confirmed`
            : "Availability not confirmed"
      );
      if (need.kind === "referral" && typeof p.approx_spaces === "number" && freshness !== "unconfirmed") {
        reasons.push(p.approx_spaces === 0 ? "No spaces right now" : `About ${p.approx_spaces} space${p.approx_spaces === 1 ? "" : "s"} available`);
      }
    }

    results.push({
      profileId: p.id,
      fullName: p.full_name,
      credentialPrefix: p.credential_prefix,
      qualification: p.qualification_level,
      city: p.primary_practice_city,
      state: p.primary_state,
      avatarPath: p.avatar_path,
      score,
      tier,
      freshness,
      availabilityLabel: avail.label,
      confirmedDaysAgo: age,
      reasons,
    });
  }

  const lastActive = new Map((candidates || []).map((p: any) => [p.id, p.last_active_at ? new Date(p.last_active_at).getTime() : 0]));
  results.sort(
    (a, b) =>
      b.score - a.score ||
      (lastActive.get(b.profileId) || 0) - (lastActive.get(a.profileId) || 0) ||
      a.fullName.localeCompare(b.fullName)
  );

  const matches = results.slice(0, opts.limit ?? 25);
  return { matches, widen: matches.length < 3 ? widenOptions(need) : [] };
}

function widenOptions(need: MatchNeed): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  if (need.setting === "in_person") out.push({ key: "setting", label: "Include telehealth" });
  if ((need.focusIds || []).length > 0) out.push({ key: "focus", label: "Any treatment focus" });
  if (need.insurance) out.push({ key: "insurance", label: "Any insurance" });
  if (need.ageBand) out.push({ key: "ageBand", label: "Any age band" });
  if (need.city) out.push({ key: "city", label: "Anywhere in the state" });
  if (need.languageId) out.push({ key: "languageId", label: "Any language" });
  return out;
}
