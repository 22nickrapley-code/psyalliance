import { clinicianName } from "@/lib/profession";
import { createClient } from "@/lib/supabase/server";
import { ConsultComposeView } from "../views";

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

  const [{ data: areas }, { data: conns }, { data: saved }, { data: memberships }, { data: pre }] = await Promise.all([
    supabase.from("lookup_values").select("value").eq("category", "treatment_specialism").order("value"),
    supabase
      .from("connections")
      .select("requester_id, addressee_id, requester:requester_id(full_name, credential_prefix, qualification_level), addressee:addressee_id(full_name, credential_prefix, qualification_level)")
      .eq("status", "accepted")
      .or(`requester_id.eq.${myself},addressee_id.eq.${myself}`),
    supabase.from("saved_clinicians").select("clinician_id, clinician:clinician_id(full_name, credential_prefix, qualification_level)").eq("profile_id", myself),
    supabase.from("consultation_group_members").select("group_id, consultation_groups(id, name, charter_body)").eq("profile_id", myself).eq("status", "joined"),
    sp.to ? supabase.from("profiles").select("id, full_name, credential_prefix").eq("id", sp.to).maybeSingle() : Promise.resolve({ data: null as any }),
  ]);
  const nameOf = (p: any) => (p ? clinicianName(p?.full_name, p?.qualification_level, p?.credential_prefix) : "Colleague");
  const colleagues = new Map<string, { id: string; name: string; relation: string }>();
  if (pre) colleagues.set(pre.id, { id: pre.id, name: nameOf(pre), relation: "" });
  for (const c of conns || []) {
    const mine = c.requester_id === myself;
    const id = mine ? c.addressee_id : c.requester_id;
    colleagues.set(id, { id, name: nameOf(mine ? (c as any).addressee : (c as any).requester), relation: "Trusted" });
  }
  for (const s of saved || []) if (!colleagues.has(s.clinician_id)) colleagues.set(s.clinician_id, { id: s.clinician_id, name: nameOf((s as any).clinician), relation: "Saved" });

  return (
    <ConsultComposeView
      kind={kind}
      areas={(areas || []).map((a: any) => a.value)}
      colleagues={Array.from(colleagues.values())}
      groups={(memberships || []).filter((m: any) => m.consultation_groups?.charter_body).map((m: any) => ({ id: m.group_id, name: m.consultation_groups.name }))}
      preselect={sp.to}
      preselectGroup={sp.group ? Number(sp.group) : undefined}
      error={sp.error}
    />
  );
}
