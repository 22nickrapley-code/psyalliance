"use server";

import { createClient } from "@/lib/supabase/server";
import { docName } from "@/lib/library";

export type LeadState = {
  ok: boolean;
  intent: "download" | "notify";
  url?: string | null;
  error?: string | null;
};

// A visitor asks for a template (or to hear when it's free). The lead is
// recorded by the database; it hands back the file's path only when the
// template has been reviewed, published and its download turned on, and
// the link we make from it lasts ten minutes.
export async function requestLibraryAction(_prev: LeadState | null, formData: FormData): Promise<LeadState> {
  const intent = formData.get("intent") === "notify" ? "notify" : "download";
  const code = String(formData.get("code") || "").toUpperCase().slice(0, 10);
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("request_library_download", {
    p_code: code,
    p_full_name: String(formData.get("full_name") || "").slice(0, 120),
    p_email: String(formData.get("email") || "").slice(0, 200),
    p_role: String(formData.get("role") || ""),
    p_state: String(formData.get("state") || ""),
    p_intent: intent,
    p_source: String(formData.get("source") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 60) || null,
  });
  if (error) return { ok: false, intent, error: error.code === "P0001" ? error.message : "Something went wrong. Please try again." };
  if (intent === "notify") return { ok: true, intent };
  if (!path) return { ok: true, intent: "notify" };
  const { data: signed } = await supabase.storage.from("documents").createSignedUrl(String(path), 600, { download: `PsyAlliance ${docName(code)}.pdf` });
  return { ok: true, intent, url: signed?.signedUrl || null };
}
