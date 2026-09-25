import { clinicianName } from "@/lib/profession";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { PageHead, Empty } from "../../_components/ui";
import { ConsultDetailView, CONSULT_TYPES, audienceLabel } from "../views";

const nameOf = (p: any) => (p ? clinicianName(p?.full_name, p?.qualification_level, p?.credential_prefix) : "A colleague");

export default async function ConsultDetailPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; published?: string }> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const { data: c } = await supabase
    .from("consultations")
    .select("*, author:author_profile_id(full_name, credential_prefix, qualification_level), consultation_groups(name)")
    .eq("id", Number(id))
    .maybeSingle();
  if (!c) {
    return (
      <>
        <PageHead eyebrow="Consult" title="Discussion not available" />
        <Empty title="This discussion isn't visible to you." body="It may be private to another audience, or it was removed." action={<a className="btn secondary" href="/dashboard/consult">Back to Consult</a>} />
      </>
    );
  }
  const [{ data: responses }, { data: recipients }] = await Promise.all([
    supabase
      .from("consultation_responses")
      .select("id, body, response_type, marked_useful, created_at, responder:responder_profile_id(full_name, credential_prefix, qualification_level, avatar_path)")
      .eq("consultation_id", c.id)
      .order("created_at"),
    c.author_profile_id === myself && (c.audience_profile_ids || []).length
      ? supabase.from("profiles").select("full_name, credential_prefix").in("id", c.audience_profile_ids)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const urls = await resolveAvatarUrls(supabase, (responses || []).map((r: any) => r.responder?.avatar_path));
  const label = c.group_id ? `Consultation group: ${(c as any).consultation_groups?.name || ""}` : audienceLabel(c);

  return (
    <ConsultDetailView
      c={{
        id: c.id,
        kind: c.kind,
        question: c.question,
        context: c.context,
        typeLabel: CONSULT_TYPES.find(([v]) => v === c.consultation_type)?.[1] || null,
        tags: c.tags || [],
        status: c.status,
        mine: c.author_profile_id === myself,
        authorName: c.author_profile_id === myself ? "You" : nameOf((c as any).author),
        createdAt: c.created_at,
        audienceLabel: label,
        recipients: (recipients || []).map(nameOf),
        responses: (responses || []).map((r: any) => ({
          id: r.id,
          name: nameOf(r.responder),
          body: r.body,
          type: r.response_type,
          useful: !!r.marked_useful,
          createdAt: r.created_at,
          avatarUrl: urls.get(r.responder?.avatar_path || "") || null,
        })),
      }}
      ok={sp.published ? "Posted. You'll be notified when colleagues reply." : undefined}
      error={sp.error}
    />
  );
}
