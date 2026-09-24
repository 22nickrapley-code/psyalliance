import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LIBRARY_SELECT, isMemberVisible, toResource } from "@/lib/library";
import { ResourceDetailView } from "../views";

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
  const { data: signed } = await supabase.storage.from("documents").createSignedUrl(r.storagePath, 60 * 60);
  return <ResourceDetailView r={r} url={signed?.signedUrl || null} error={sp.error} />;
}
