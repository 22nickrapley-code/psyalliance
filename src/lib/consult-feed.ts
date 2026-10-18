import { clinicianName } from "@/lib/profession";

// Home's consultation feed (Nick, 18 Oct): like a professional news feed,
// but only discussions the member can already see, ranked for them:
//   1. replies to their own questions,
//   2. questions their trusted colleagues asked or joined,
//   3. questions tagged with one of their specialties,
//   4. other open questions they could answer.
// Closed discussions only appear when they match a specialty or a trusted
// colleague took part (worth reading); everything else is newest first
// within its group.

export type FeedItem = {
  id: number;
  question: string;
  authorId: string;
  authorName: string;
  authorAvatarPath: string | null;
  createdAt: string;
  lastActivity: string;
  replies: number;
  open: boolean;
  mine: boolean;
  reason: string;
  // Trusted colleagues who replied, first three.
  trustedJoined: { id: string; name: string }[];
  tag: string | null;
  group: 1 | 2 | 3 | 4;
};

const nameOf = (p: any) => (p ? clinicianName(p.full_name, p.qualification_level, p.credential_prefix) : "A colleague");

export function fetchConsultFeedRows(supabase: any, me: string) {
  return Promise.all([
    supabase
      .from("consultations")
      .select(
        "id, question, tags, status, created_at, resolved_at, author_profile_id, author:author_profile_id(full_name, credential_prefix, qualification_level, avatar_path, is_demo), consultation_responses(id)"
      )
      .eq("kind", "question")
      .in("status", ["open", "responses_received", "resolved"])
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("consultation_responses")
      .select("consultation_id, responder_profile_id, created_at, responder:responder_profile_id(full_name, credential_prefix, qualification_level)")
      .order("created_at", { ascending: false })
      .limit(250),
    supabase.rpc("viewer_is_demo"),
  ]);
}

export function rankConsultFeed(
  [consults, responses, demo]: Awaited<ReturnType<typeof fetchConsultFeedRows>>,
  me: string,
  trusted: Set<string>,
  specialties: string[]
): FeedItem[] {
  const viewerDemo = demo?.data === true;
  const mySpecs = specialties.map((s) => s.toLowerCase());
  const byConsult = new Map<number, any[]>();
  for (const r of (responses?.data as any[]) || []) {
    const id = Number(r.consultation_id);
    byConsult.set(id, [...(byConsult.get(id) || []), r]);
  }
  const twoWeeks = Date.now() - 14 * 86_400_000;
  const items: FeedItem[] = [];
  for (const c of (consults?.data as any[]) || []) {
    const mine = c.author_profile_id === me;
    // Fictional colleagues and real ones never mix.
    if (!mine && !!c.author?.is_demo !== viewerDemo) continue;
    const rs = byConsult.get(Number(c.id)) || [];
    const others = rs.filter((r) => r.responder_profile_id !== me);
    const iReplied = rs.some((r) => r.responder_profile_id === me);
    const last = [c.created_at, ...rs.map((r) => r.created_at)].sort().pop() as string;
    const trustedJoined: { id: string; name: string }[] = [];
    for (const r of others) {
      if (trusted.has(r.responder_profile_id) && !trustedJoined.some((t) => t.id === r.responder_profile_id)) {
        trustedJoined.push({ id: r.responder_profile_id, name: nameOf(r.responder) });
      }
    }
    const tag = ((c.tags as string[]) || []).find((t) => mySpecs.includes(String(t).toLowerCase())) || null;
    const open = c.status !== "resolved";
    const newReplyToMe = mine && others.some((r) => new Date(r.created_at).getTime() > twoWeeks);
    const trustedAuthor = !mine && trusted.has(c.author_profile_id);

    let group: FeedItem["group"] | null = null;
    let reason = "";
    if (newReplyToMe) {
      group = 1;
      reason = others.length === 1 ? "A reply to your question" : `${others.length} replies to your question`;
    } else if (trustedAuthor || trustedJoined.length > 0) {
      group = 2;
      reason = trustedAuthor ? "From a trusted colleague" : "A trusted colleague replied";
    } else if (tag && !mine) {
      group = 3;
      reason = open ? `Matches ${tag}` : `Answered · ${tag}`;
    } else if (open && !mine && !iReplied) {
      group = 4;
      reason = "Open question";
    }
    if (!group) continue;
    items.push({
      id: Number(c.id),
      question: String(c.question || ""),
      authorId: c.author_profile_id,
      authorName: mine ? "You" : nameOf(c.author),
      authorAvatarPath: c.author?.avatar_path || null,
      createdAt: c.created_at,
      lastActivity: last,
      replies: Array.isArray(c.consultation_responses) ? c.consultation_responses.length : rs.length,
      open,
      mine,
      reason,
      trustedJoined: trustedJoined.slice(0, 3),
      tag,
      group,
    });
  }
  items.sort((a, b) => a.group - b.group || b.lastActivity.localeCompare(a.lastActivity));
  return items.slice(0, 30);
}
