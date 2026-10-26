import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Opens one file or voice note from a conversation, for the two people in it.
// Voice notes play in the page (range requests, so Safari and seeking work);
// everything else downloads.
export const dynamic = "force-dynamic";

const PLAYABLE = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/x-m4a", "audio/aac"]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Please sign in again.", { status: 401 });

  const { data: meta } = await supabase.rpc("message_file", { p_message: Number(id) });
  const f = meta as { path: string; name: string; mime: string | null; kind: string; size: number } | null;
  if (!f) return new NextResponse("Not found", { status: 404 });
  const { data: blob, error } = await supabase.storage.from("message-files").download(f.path);
  if (error || !blob) return new NextResponse("Not found", { status: 404 });

  const mime = (f.mime || "").toLowerCase();
  const inline = f.kind === "audio" && PLAYABLE.has(mime);
  const total = blob.size;
  const headers: Record<string, string> = {
    "Content-Type": inline ? mime : "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : total - 1;
    end = Math.min(end, total - 1);
    if (start > end || start >= total) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    return new NextResponse(blob.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(blob, { status: 200, headers: { ...headers, "Content-Length": String(total) } });
}
