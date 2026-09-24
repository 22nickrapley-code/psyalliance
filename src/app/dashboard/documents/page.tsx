import { createClient } from "@/lib/supabase/server";
import { LIBRARY_SELECT, isMemberVisible, matchesQuery, toResource } from "@/lib/library";
import { LibraryView, MyLibraryView, type MyDoc } from "./views";

// Signed links sit on a rendered page, so give them an hour: long enough
// for a normal browse-then-click, short enough that a leaked link expires.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function DocumentsPage(props: {
  searchParams: Promise<{ tab?: string; q?: string; category?: string; folder?: string; uploaded?: string; copied?: string; error?: string }>;
}) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myself = user!.id;

  const [{ data: shared }, { data: mine }, { data: folders }] = await Promise.all([
    supabase.from("documents").select(LIBRARY_SELECT).eq("owner_scope", "world"),
    supabase
      .from("documents")
      .select("id, title, storage_path, folder_id, created_at, sources")
      .eq("profile_id", myself)
      .eq("owner_scope", "personal")
      .order("created_at", { ascending: false }),
    supabase.from("document_folders").select("id, name").eq("profile_id", myself).order("name"),
  ]);

  const myDocs = mine || [];

  if (sp.tab === "mine") {
    const folder = sp.folder || "all";
    const counts: Record<string, number> = {};
    for (const d of myDocs) {
      const k = d.folder_id ? String(d.folder_id) : "unfiled";
      counts[k] = (counts[k] || 0) + 1;
    }
    const inFolder = myDocs.filter((d) =>
      folder === "all" ? true : folder === "unfiled" ? !d.folder_id : String(d.folder_id) === folder
    );
    const docs: MyDoc[] = await Promise.all(
      inFolder.map(async (d) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, SIGNED_URL_TTL_SECONDS);
        return {
          id: d.id,
          title: d.title,
          storagePath: d.storage_path,
          folderId: d.folder_id,
          createdAt: d.created_at,
          source: d.sources,
          url: data?.signedUrl || null,
        };
      })
    );
    const notice = sp.copied
      ? `Working copy of ${sp.copied === "1" ? "the resource" : sp.copied} saved. Only you can see it.`
      : sp.uploaded
        ? "Uploaded. Only you can see it."
        : null;
    return (
      <MyLibraryView
        docs={docs}
        folders={folders || []}
        folder={folder}
        folderCounts={counts}
        total={myDocs.length}
        notice={notice}
        error={sp.error}
      />
    );
  }

  const q = (sp.q || "").trim();
  const category = sp.category || "";
  const resources = (shared || [])
    .filter(isMemberVisible)
    .map(toResource)
    .filter((r) => (!category || r.category === category) && matchesQuery(r, q))
    .sort((a, b) => (a.code || "ZZ").localeCompare(b.code || "ZZ") || a.title.localeCompare(b.title));

  const { count: appointments } = await supabase
    .from("library_reviewers")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", myself)
    .eq("active", true);
  return <LibraryView resources={resources} q={q} category={category} mineCount={myDocs.length} error={sp.error} isReviewer={(appointments || 0) > 0} />;
}
