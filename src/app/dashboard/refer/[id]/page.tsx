import { clinicianName } from "@/lib/profession";
import { createClient } from "@/lib/supabase/server";
import { loadNeedOptions } from "@/lib/need-options";
import { resolveAvatarUrls } from "@/lib/avatars";
import { PageHead, Empty } from "../../_components/ui";
import { ReferTrackView, referralThreadTitle, type ReferralDetail } from "../views";
import { loadThread } from "@/lib/threads";

export const metadata = { title: "Referral" };

// One referral: the owner tracks replies, chooses a colleague and closes
// it; a recipient reads the need and replies.
export default async function ReferralDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; sent?: string; responded?: string; closed?: string; rated?: string }>;
}) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [options, { data: r }] = await Promise.all([
    loadNeedOptions(supabase),
    supabase
      .from("referral_requests")
      .select("*, requester:requesting_profile_id(full_name, credential_prefix, qualification_level)")
      .eq("id", Number(id))
      .maybeSingle(),
  ]);

  if (!r) {
    return (
      <>
        <PageHead eyebrow="Refer" title="Referral not available" />
        <Empty title="This referral isn't visible to you." body="It may have been closed, or it was sent to a different audience." action={<a className="btn secondary" href="/dashboard/refer">Back to referrals</a>} />
      </>
    );
  }

  const isMine = r.requesting_profile_id === myself;
  const { data: responses } = await supabase
    .from("referral_responses")
    .select("responding_profile_id, status, message, created_at, responded_at, responder:responding_profile_id(full_name, credential_prefix, qualification_level, avatar_path)")
    .eq("referral_request_id", r.id)
    .order("created_at", { ascending: true });
  const urls = await resolveAvatarUrls(supabase, (responses || []).map((x: any) => x.responder?.avatar_path));
  const nameOf = (p: any) => (p ? clinicianName(p?.full_name, p?.qualification_level, p?.credential_prefix) : "A colleague");

  const ids: number[] = (r.specialism_lookup_ids?.length ? r.specialism_lookup_ids : r.specialism_lookup_id ? [r.specialism_lookup_id] : []).map(Number);
  const focus = ids.map((i) => options.focus.find((f) => f.id === i)?.value).filter(Boolean).join(" + ") || "Any focus";
  const where = [r.city, options.states.find((s) => s.code === r.state)?.name || r.state].filter(Boolean).join(", ") || "Anywhere";
  const timeframeLabel = r.timeframe === "urgent" ? "Urgent" : r.timeframe === "within_month" ? "Within a month" : "Flexible";
  const audienceLabel = r.audience_type === "selected" ? `Selected colleagues (${(r.audience_profile_ids || []).length})` : r.audience_type === "trusted" ? "Trusted colleagues" : "Verified network";

  const chosenRow = (responses || []).find((x: any) => x.status === "accepted");
  const mine = (responses || []).find((x: any) => x.responding_profile_id === myself);

  let rated = false;
  if (isMine && chosenRow && r.status === "closed") {
    const { data: rating } = await supabase
      .from("collaboration_ratings")
      .select("id")
      .eq("rater_profile_id", myself)
      .eq("context_type", "referral")
      .eq("context_id", r.id)
      .maybeSingle();
    rated = !!rating;
  }

  const detail: ReferralDetail = {
    id: r.id,
    isMine,
    focus,
    where,
    status: r.status,
    audience: r.audience_type,
    audienceCount: r.audience_type === "selected" ? (r.audience_profile_ids || []).length : null,
    timeframe: r.timeframe,
    notes: r.notes,
    createdAt: r.created_at,
    requesterName: nameOf(r.requester),
    requesterId: r.requesting_profile_id,
    rows: [
      ["Where", where],
      ["Setting", r.modality === "virtual" ? "Virtual" : r.modality === "in_person" ? "In person" : "Virtual or in person"],
      ...(r.insurance ? [["Insurance", r.insurance] as [string, string]] : []),
      ...(r.age_band ? [["Age band", r.age_band] as [string, string]] : []),
      ["Timeframe", timeframeLabel],
      ...(isMine ? [["Audience", audienceLabel] as [string, string]] : []),
      ["Client details shared", "None"],
    ],
    responses: (responses || []).map((x: any) => ({
      profileId: x.responding_profile_id,
      name: nameOf(x.responder),
      status: x.status,
      message: x.message,
      avatarUrl: urls.get(x.responder?.avatar_path || "") || null,
    })),
    myResponse: mine ? { status: mine.status, message: mine.message } : null,
    chosen: chosenRow ? { profileId: chosenRow.responding_profile_id, name: nameOf((chosenRow as any).responder) } : null,
    rated,
    meId: myself,
  };

  // The conversation about this referral shows in place: for the referrer,
  // one per colleague who replied; for a colleague, the one with the referrer.
  const title = referralThreadTitle(focus, where);
  const others: string[] = isMine ? (responses || []).map((x: any) => x.responding_profile_id) : mine ? [r.requesting_profile_id] : [];
  if (others.length) {
    const loaded = await Promise.all(others.map(async (other) => [other, await loadThread(supabase, myself, [other], title)] as const));
    detail.threads = Object.fromEntries(loaded);
    // A question asked before questions were posted to the conversation
    // (or one that didn't reach it) is shown first, so nothing is missing.
    for (const x of (responses || []) as any[]) {
      if (!x.message || !["question", "interested", "unavailable", "accepted"].includes(x.status)) continue;
      const other = isMine ? x.responding_profile_id : x.responding_profile_id === myself ? r.requesting_profile_id : null;
      const t = other ? detail.threads[other] : null;
      if (!t || t.messages.some((m) => m.body.trim() === String(x.message).trim())) continue;
      if (x.status !== "question" && t.messages.length === 0) continue;
      t.messages.unshift({
        id: -Number(x.created_at ? Date.parse(x.created_at) : 1),
        mine: x.responding_profile_id === myself,
        author: x.responding_profile_id === myself ? "You" : nameOf(x.responder),
        body: String(x.message),
        at: x.responded_at || x.created_at || r.created_at,
      });
    }
  }

  const ok = sp.sent
    ? "Referral sent. You'll be notified as colleagues reply."
    : sp.responded && sp.responded !== "question"
      ? "Reply sent."
      : sp.closed
        ? "Referral closed."
        : sp.rated
          ? "Thanks. That stays private to you."
          : undefined;
  return <ReferTrackView r={detail} ok={ok} error={sp.error} />;
}
