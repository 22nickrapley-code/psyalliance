import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return new NextResponse("Document not found", { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sign in to open this document", { status: 401 });

  const [{ data: doc }, { data: me }] = await Promise.all([
    supabase.from("documents")
      .select("storage_path, owner_scope, profile_id, review_status")
      .eq("id", Number(id)).maybeSingle(),
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
  ]);
  if (!doc || !(
    (doc.owner_scope === "personal" && doc.profile_id === user.id) ||
    (doc.owner_scope === "world" && (doc.review_status === "published" || me?.is_admin ||
      (doc.review_status === "needs_review" || doc.review_status === "in_review")))
  )) return new NextResponse("Document not found", { status: 404 });

  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60);
  if (error || !data?.signedUrl) return new NextResponse("Document temporarily unavailable", { status: 503 });
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
