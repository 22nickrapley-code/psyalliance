import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIBRARY_SELECT, isAvailable, isMemberVisible } from "@/lib/library";
import { saveWorkingCopyAction } from "@/app/(site)/dashboard/documents/actions";

// "Save a copy to My files" from the Library. The Library is the one place resources live; a private copy is a
// file only the member can see, kept in My files, and the review gate on templates is the same one the Library uses.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^PA-\d{2}$/.test(code)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/sign-in", req.url), 303);
  const { data: doc } = await supabase.from("documents").select(LIBRARY_SELECT).eq("owner_scope", "world").eq("library_code", code).maybeSingle();
  if (!doc || !isMemberVisible(doc) || !isAvailable(doc)) return NextResponse.redirect(new URL(`/dashboard/library?resource=${code}`, req.url), 303);
  const fd = new FormData();
  fd.set("document_id", String(doc.id));
  return saveWorkingCopyAction(fd);
}
