import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIBRARY_SELECT, isAvailable, isMemberVisible } from "@/lib/library";

// Opens or downloads one Library template, for a signed-in member.
// A template that is not ready (still waiting for review, and the preview
// setting is off) has no file here, exactly as on the old Library page.
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^PA-\d{2}$/.test(code)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Please sign in again.", { status: 401 });

  const { data: doc } = await supabase.from("documents").select(LIBRARY_SELECT).eq("owner_scope", "world").eq("library_code", code).maybeSingle();
  if (!doc || !isMemberVisible(doc) || !isAvailable(doc) || !doc.storage_path) return new NextResponse("Not found", { status: 404 });

  const { data: blob, error } = await supabase.storage.from("documents").download(String(doc.storage_path));
  if (error || !blob) return new NextResponse("Not found", { status: 404 });

  const tail = String(doc.storage_path).split("/").pop() || `${code}.pdf`;
  const clean = tail.replace(/^\d+-([0-9a-f]{10}-)?/, "");
  const ext = (clean.split(".").pop() || "pdf").toLowerCase();
  const name = clean.startsWith(code) ? clean : `${code}_${clean}`;
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(blob.size),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
