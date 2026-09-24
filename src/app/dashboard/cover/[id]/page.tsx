import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { findMatches, type Match } from "@/lib/match-engine";
import { resolveAvatarUrls } from "@/lib/avatars";
import { PageHead, Empty } from "../../_components/ui";
import { CoverNeedsView, CoverCandidatesView, CoverInviteView, CoverTrackView } from "../views";
import { loadPlan, caseNeed, excludedFor } from "../data";

type SP = Record<string, string | string[] | undefined>;

export default async function CoverPlanPage(props: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? undefined;
  };
  const all = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  const step = one("step") || "needs";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;
  const options = await loadNeedOptions(supabase);
  const loaded = await loadPlan(supabase, myself, Number(id), options);
  if (!loaded) {
    return (
      <>
        <PageHead eyebrow="Cover" title="Plan not found" />
        <Empty title="This plan isn't yours or no longer exists." body="Cover plans are private to the member who made them." action={<a className="btn secondary" href="/dashboard/cover">Back to Cover</a>} />
      </>
    );
  }
  const { plan, raw, cases, summary } = loaded;

  if (step === "candidates") {
    const open = raw.filter((c: any) => c.status === "needs_cover" || c.status === "declined_all");
    const results = await Promise.all(
      open.map(async (c: any) => {
        const exclude = await excludedFor(supabase, c.id);
        const { matches } = await findMatches(supabase, myself, caseNeed(c, plan), { exclude, limit: 5 });
        return [c.id, matches] as [number, Match[]];
      })
    );
    const suggestions = Object.fromEntries(results);
    const every = results.flatMap(([, m]) => m);
    const urls = await resolveAvatarUrls(supabase, every.map((m) => m.avatarPath));
    const avatarUrls = Object.fromEntries(every.map((m) => [m.profileId, urls.get(m.avatarPath || "") || null]));
    return <CoverCandidatesView plan={summary} cases={cases} suggestions={suggestions} avatarUrls={avatarUrls} />;
  }

  if (step === "invite") {
    const pickIds = Array.from(new Set(cases.flatMap((c) => all(`pick_${c.id}`))));
    const { data: people } = pickIds.length
      ? await supabase.from("profiles").select("id, full_name, credential_prefix").in("id", pickIds)
      : { data: [] as any[] };
    const nameOf = (pid: string) => {
      const p = (people || []).find((x: any) => x.id === pid);
      return p ? `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}` : "Colleague";
    };
    const rows = cases
      .filter((c) => c.status === "needs_cover" || c.status === "declined_all")
      .map((c) => ({ caseId: c.id, reference: c.reference, focus: c.focus, picks: all(`pick_${c.id}`).map((pid) => ({ id: pid, name: nameOf(pid) })) }));
    return <CoverInviteView plan={summary} rows={rows} error={one("error")} />;
  }

  if (step === "track") {
    const nextSuggestion: Record<number, { id: string; name: string } | null> = {};
    if (plan.status !== "completed" && plan.status !== "cancelled") {
      for (const c of raw.filter((c: any) => c.status === "needs_cover" || c.status === "declined_all")) {
        const exclude = await excludedFor(supabase, c.id);
        const { matches } = await findMatches(supabase, myself, caseNeed(c, plan), { exclude, limit: 1 });
        nextSuggestion[c.id] = matches[0] ? { id: matches[0].profileId, name: matches[0].credentialPrefix ? `${matches[0].credentialPrefix} ${matches[0].fullName}` : matches[0].fullName } : null;
      }
    }
    let toRate: { id: string; name: string }[] = [];
    if (plan.status === "completed") {
      const covered = new Map(cases.filter((c) => c.assignedId).map((c) => [c.assignedId!, c.assignedName || "Colleague"]));
      const { data: rated } = await supabase
        .from("collaboration_ratings")
        .select("colleague_profile_id")
        .eq("rater_profile_id", myself)
        .eq("context_type", "cover")
        .eq("context_id", plan.id);
      const done = new Set((rated || []).map((r: any) => r.colleague_profile_id));
      toRate = Array.from(covered.entries()).filter(([pid]) => !done.has(pid)).map(([pid, name]) => ({ id: pid, name }));
    }
    const sent = one("sent");
    const ok = one("completed")
      ? "Plan completed. Colleagues who covered for you now show as Worked with before."
      : one("rated")
        ? "Thanks. That stays private to you."
        : sent
          ? `${sent} cover request${sent === "1" ? "" : "s"} sent.`
          : undefined;
    return <CoverTrackView plan={summary} cases={cases} nextSuggestion={nextSuggestion} toRate={toRate} ok={ok} error={one("error")} />;
  }

  return <CoverNeedsView plan={summary} cases={cases} options={options} error={one("error")} />;
}
