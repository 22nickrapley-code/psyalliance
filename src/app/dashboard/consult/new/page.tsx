import { loadColleagueSuggestions } from "@/lib/colleague-suggestions";
import { createClient } from "@/lib/supabase/server";
import { ConsultComposeView } from "../views";

export const metadata = { title: "Ask colleagues" };

export default async function NewConsultPage(props: { searchParams: Promise<{ kind?: string; to?: string; group?: string; error?: string; draft?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;
  // Editing a draft: start from what was written and chosen.
  const { data: d } = sp.draft
    ? await supabase.from("consultations").select("*").eq("id", Number(sp.draft)).eq("author_profile_id", myself).eq("status", "draft").maybeSingle<any>()
    : { data: null as any };
  const kindRaw = d?.kind || sp.kind;
  const kind = (kindRaw === "supervision_request" || kindRaw === "supervision_offer" ? kindRaw : "question") as
    | "question"
    | "supervision_request"
    | "supervision_offer";

  const [{ data: areas }, { data: memberships }, suggestions] = await Promise.all([
    supabase.from("lookup_values").select("value").eq("category", "treatment_specialism").order("value"),
    supabase.from("consultation_group_members").select("group_id, consultation_groups(id, name, charter_body)").eq("profile_id", myself).eq("status", "joined"),
    loadColleagueSuggestions(supabase, myself, sp.to || null),
  ]);
  const groupIds = (memberships || []).filter((m: any) => m.consultation_groups?.charter_body).map((m: any) => m.group_id as number);
  const { data: memberRows } = groupIds.length
    ? await supabase.from("consultation_group_members").select("group_id").in("group_id", groupIds).eq("status", "joined")
    : { data: [] as any[] };
  const memberCount = new Map<number, number>();
  for (const r of memberRows || []) memberCount.set(r.group_id, (memberCount.get(r.group_id) || 0) + 1);

  return (
    <ConsultComposeView
      kind={kind}
      areas={(areas || []).map((a: any) => a.value)}
      suggestions={suggestions}
      groups={(memberships || []).filter((m: any) => m.consultation_groups?.charter_body).map((m: any) => ({ id: m.group_id, name: m.consultation_groups.name, members: memberCount.get(m.group_id) || 0 }))}
      preselect={sp.to}
      preselectGroup={sp.group ? Number(sp.group) : undefined}
      error={sp.error}
      preset={d ? { question: d.question || "", context: d.context || "" } : undefined}
      draft={
        d
          ? {
              id: d.id,
              audience: d.group_id
                ? `group:${d.group_id}`
                : d.audience_type === "selected"
                  ? (d.audience_profile_ids || []).length === 1 ? "one" : "selected"
                  : d.audience_type,
              recipients: d.audience_profile_ids || [],
              tagArea: (d.tags || []).find((t: string) => (areas || []).some((a: any) => a.value === t)) || "",
              tagTopic: (d.tags || []).find((t: string) => !(areas || []).some((a: any) => a.value === t)) || "",
              type: d.consultation_type || "practice_question",
            }
          : undefined
      }
    />
  );
}
