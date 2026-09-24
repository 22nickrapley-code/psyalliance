import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LIBRARY_SELECT, isMemberVisible, toResource } from "@/lib/library";
import { ResourceDetailView } from "../views";
import { REVIEWER_ROLE_LABELS, type ReviewerRole } from "@/lib/library-governance";

// One Practice Library resource: the card's facts, the PDF, a private
// working copy and the workflow it supports. Addressed by PA number
// (/dashboard/documents/PA-02) so workflows can link to it directly.
export default async function ResourcePage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await props.params;
  const sp = await props.searchParams;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select(LIBRARY_SELECT)
    .eq("owner_scope", "world")
    .eq("library_code", decodeURIComponent(code).toUpperCase())
    .maybeSingle();
  if (!doc || !isMemberVisible(doc)) notFound();

  const r = toResource(doc);
  const [{ data: signed }, { data: reviews }] = await Promise.all([
    supabase.storage.from("documents").createSignedUrl(r.storagePath, 60 * 60),
    r.reviewed
      ? supabase
          .from("document_reviews")
          .select("reviewer_role, approved, reviewer:reviewer_profile_id(full_name, credential_prefix)")
          .eq("document_id", r.id)
          .eq("document_version", r.version)
          .eq("approved", true)
          .is("invalidated_at", null)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const reviewers = (reviews || []).map((rv: any) => ({
    role: REVIEWER_ROLE_LABELS[rv.reviewer_role as ReviewerRole] || rv.reviewer_role,
    name: rv.reviewer ? `${rv.reviewer.credential_prefix ? rv.reviewer.credential_prefix + " " : ""}${rv.reviewer.full_name}` : "Appointed reviewer",
  }));
  return <ResourceDetailView r={r} url={signed?.signedUrl || null} error={sp.error} reviewers={reviewers} />;
}
