import { createClient } from "@/lib/supabase/server";
import { findMatches } from "@/lib/match-engine";
import { resolveAvatarUrls } from "@/lib/avatars";
import { ConsultIndexView, audienceLabel, type ConsultTab, type PostItem } from "./views";

const nameOf = (p: any) => (p ? `${p.credential_prefix ? p.credential_prefix + " " : ""}${p.full_name}` : "A colleague");

export default async function ConsultPage(props: { searchParams: Promise<{ tab?: string; tag?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const tab = (["discussions", "mine", "groups", "supervision"].includes(sp.tab || "") ? sp.tab : "discussions") as ConsultTab;
  const activeTag = sp.tag || "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: follows }, { data: myFocus }, { data: trustedRows }, { data: profile }] = await Promise.all([
    supabase.from("consult_tag_follows").select("tag").eq("profile_id", myself),
    supabase
      .from("profile_lookup_values")
      .select("lookup_value_id, rank, lookup_values!inner(category, value)")
      .eq("profile_id", myself)
      .eq("lookup_values.category", "treatment_specialism")
      .order("rank"),
    supabase
      .from("connections")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
    supabase.from("profiles").select("primary_state").eq("id", myself).maybeSingle(),
  ]);
  const followed = (follows || []).map((f: any) => f.tag);
  const mySpecialties = (myFocus || []).map((r: any) => r.lookup_values.value as string);
  const trusted = new Set((trustedRows || []).map((c: any) => (c.requester_id === myself ? c.addressee_id : c.requester_id)));
  const interests = new Set([...followed, ...mySpecialties.slice(0, 5)]);

  let posts: PostItem[] = [];
  let groups: any[] = [];
  let supervisors: any[] = [];
  let supervisorAvatars: Record<string, string | null> = {};

  if (tab === "groups") {
    const { data: memberships } = await supabase
      .from("consultation_group_members")
      .select("id, status, group_id, consultation_groups(id, name, purpose)")
      .eq("profile_id", myself)
      .in("status", ["joined", "invited"]);
    const ids = (memberships || []).map((m: any) => m.group_id);
    const { data: allMembers } = ids.length
      ? await supabase.from("consultation_group_members").select("group_id").in("group_id", ids).eq("status", "joined")
      : { data: [] as any[] };
    groups = (memberships || [])
      .filter((m: any) => m.consultation_groups)
      .map((m: any) => ({
        id: m.group_id,
        name: m.consultation_groups.name,
        purpose: m.consultation_groups.purpose,
        members: (allMembers || []).filter((x: any) => x.group_id === m.group_id).length,
        status: m.status,
        membershipId: m.id,
      }));
  } else {
    let q = supabase
      .from("consultations")
      .select("id, kind, question, context, tags, audience_type, audience_profile_ids, group_id, status, created_at, author_profile_id, author:author_profile_id(full_name, credential_prefix, is_demo), consultation_responses(count)")
      .order("created_at", { ascending: false })
      .limit(60);
    if (tab === "mine") q = q.eq("author_profile_id", myself);
    else {
      q = q.is("group_id", null).in("status", ["open", "responses_received", "resolved"]);
      q = tab === "supervision" ? q.in("kind", ["supervision_request", "supervision_offer"]) : q.eq("kind", "question");
      if (activeTag) q = q.contains("tags", [activeTag]);
    }
    const { data } = await q;
    posts = (data || [])
      .filter((c: any) => c.author_profile_id === myself || !c.author?.is_demo)
      .map((c: any) => {
        const tagHit = (c.tags || []).find((t: string) => interests.has(t));
        const why = trusted.has(c.author_profile_id) ? "From your trusted circle" : tagHit ? `Matches ${tagHit}` : undefined;
        return {
          id: c.id,
          kind: c.kind,
          question: c.question,
          context: c.context,
          tags: c.tags || [],
          audienceLabel: audienceLabel(c),
          authorName: c.author_profile_id === myself ? "You" : nameOf(c.author),
          createdAt: c.created_at,
          replies: c.consultation_responses?.[0]?.count ?? 0,
          status: c.status,
          mine: c.author_profile_id === myself,
          why,
        };
      });
    if (tab === "discussions" && !activeTag) {
      posts.sort((a, b) => Number(!!b.why) - Number(!!a.why) || Number(a.status === "resolved") - Number(b.status === "resolved"));
    }
  }

  if (tab === "supervision") {
    const focusIds = (myFocus || []).slice(0, 1).map((r: any) => Number(r.lookup_value_id));
    const { matches } = await findMatches(supabase, myself, { kind: "supervision", focusIds, state: profile?.primary_state || null }, { limit: 5 });
    supervisors = matches;
    const u = await resolveAvatarUrls(supabase, matches.map((m) => m.avatarPath));
    supervisorAvatars = Object.fromEntries(matches.map((m) => [m.profileId, u.get(m.avatarPath || "") || null]));
  }

  const tagSet = new Set<string>([...followed, ...mySpecialties.slice(0, 3)]);
  for (const p of posts) for (const t of p.tags) if (tagSet.size < 14) tagSet.add(t);
  if (activeTag) tagSet.add(activeTag);

  return (
    <ConsultIndexView
      tab={tab}
      posts={posts}
      tags={Array.from(tagSet)}
      followed={followed}
      activeTag={activeTag}
      groups={groups}
      supervisors={supervisors}
      supervisorAvatars={supervisorAvatars}
      error={sp.error}
    />
  );
}
