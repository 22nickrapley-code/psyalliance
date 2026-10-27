import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LIBRARY_SELECT, isMemberVisible, toResource, codeFromSlug } from "@/lib/library";
import { ResourceDetailView } from "../views";

export const metadata = { title: "Library" };

// One Library resource: the card's facts, the PDF, a private
// working copy and the workflow it supports. Addressed by PA number
// (/dashboard/documents/extended-leave-pack); PA numbers still resolve.
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
    .eq("library_code", codeFromSlug(code) || "")
    .maybeSingle();
  if (!doc || !isMemberVisible(doc)) notFound();

  const r = toResource(doc);
  // Only a template that's ready opens (Nick, 18 Oct: "coming soon" otherwise).
  const { data: signed } = r.available ? await supabase.storage.from("documents").createSignedUrl(r.storagePath, 60 * 60) : { data: null };
  return <ResourceDetailView r={r} url={signed?.signedUrl || null} error={sp.error} />;
}
