import { getCloudflareContext } from "@opennextjs/cloudflare";

// Voice notes as text (v7, Nick 9 Nov). Runs Whisper on Cloudflare Workers AI,
// which already hosts the site, so no new provider sees the audio. Needs the
// "AI" binding in wrangler.jsonc. Until that binding exists the member sees a
// plain "not switched on yet" message. TRANSCRIBE_MOCK (local tests only)
// returns fixed text.
type Out = { ok: true; text: string } | { ok: false; error: string };

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function transcribeAudio(bytes: Uint8Array): Promise<Out> {
  if (process.env.TRANSCRIBE_MOCK) return { ok: true, text: process.env.TRANSCRIBE_MOCK };
  let ai: any = null;
  try {
    ai = (getCloudflareContext().env as any)?.AI ?? null;
  } catch {
    ai = null;
  }
  if (!ai) return { ok: false, error: "Showing voice notes as text isn't switched on yet." };
  if (bytes.length > 12 * 1024 * 1024) return { ok: false, error: "That voice note is too long to show as text." };
  try {
    const r: any = await ai.run("@cf/openai/whisper-large-v3-turbo", { audio: toBase64(bytes) });
    if (typeof r?.text === "string") return { ok: true, text: r.text };
  } catch {
    /* fall through to the original model */
  }
  try {
    const r: any = await ai.run("@cf/openai/whisper", { audio: Array.from(bytes) });
    if (typeof r?.text === "string") return { ok: true, text: r.text };
  } catch {
    /* reported below */
  }
  return { ok: false, error: "That voice note could not be turned into text. Try again in a moment." };
}
