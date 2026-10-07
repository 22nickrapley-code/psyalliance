import { loadColleagueSuggestions } from "@/lib/colleague-suggestions";
import { createClient } from "@/lib/supabase/server";
import { ConsultComposeView } from "../views";

export const metadata = { title: "Ask colleagues" };

export default async function NewConsultPage(props: { searchParams: Promise<{ kind?: string; to?: string; group?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const kind = (sp.kind === "supervision_request" || sp.kind === "supervision_offer" ? sp.kind : "question") as
    | "question"
    | "supervision_request"
    | "supervision_offer";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

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
    />
  );
}
