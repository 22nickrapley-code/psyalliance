import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Files and voice notes for the workspace's conversations. They are added
// here (as the signed-in member, into the private bucket, in the folder of the
// conversation they belong to) and sent with the message afterwards. Nothing
// is public: only the two people in the conversation can open a file.
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;
const AUDIO = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/x-m4a", "audio/aac"]);

const no = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return no("That isn't allowed.", 403);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return no("Please sign in again.", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return no("That file couldn't be read.", 400);
  }
  const key = String(form.get("key") || "");
  const kind = String(form.get("kind") || "");
  const file = form.get("file");
  if (!(file instanceof File) || !["file", "audio"].includes(kind)) return no("That file couldn't be read.", 400);
  if (file.size === 0) return no("That file is empty.", 400);
  if (file.size > MAX_BYTES) return no("Choose a file smaller than 20 MB.", 413);

  const { data: conv } = await supabase.rpc("message_upload_target", { p_key: key });
  if (!conv) return no("Conversation not found.", 404);

  let mime = (file.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (kind === "audio" && !AUDIO.has(mime)) return no("That recording can't be sent.", 415);
  if (kind === "file" && !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)) mime = "application/octet-stream";

  const original = String(file.name || (kind === "audio" ? "Voice note" : "Attachment")).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "Attachment";
  const safe = original.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-80) || "file";
  const path = `${conv}/${user.id}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from("message-files").upload(path, file, { contentType: mime, upsert: false });
  if (error) return no("That file didn't upload. Please try again.", 500);

  const seconds = Number(form.get("duration"));
  return NextResponse.json({
    ok: true,
    attachment: { kind, path, name: original, size: file.size, mime, duration: kind === "audio" && Number.isFinite(seconds) ? Math.max(0, Math.min(3600, Math.round(seconds))) : null },
  });
}

// A file that was added to a draft and then dropped.
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return no("That isn't allowed.", 403);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return no("Please sign in again.", 401);
  const body = (await req.json().catch(() => ({}))) as { path?: string };
  const path = String(body.path || "");
  const [conv, owner] = path.split("/");
  if (!/^[0-9]{1,18}$/.test(conv || "") || owner !== user.id) return no("That file can't be removed.", 403);
  // A file that has been sent stays with its message.
  const { data: used } = await supabase.rpc("message_file_in_use", { p_path: path });
  if (used) return no("That file has been sent.", 409);
  await supabase.storage.from("message-files").remove([path]);
  return NextResponse.json({ ok: true });
}
