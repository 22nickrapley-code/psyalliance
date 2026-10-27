"use server";

import { IS_DEMO_SITE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type SandboxEvent = { kind: string; title: string; body: string; href: string; action: string };

// Moves the sandbox story on by one arrival when it's due. The database
// decides timing and only answers for a sandbox guest on the demo site.
export async function sandboxTickAction(): Promise<SandboxEvent | null> {
  if (!IS_DEMO_SITE) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sandbox_tick");
  if (error || !data || typeof data !== "object") return null;
  const e = data as { kind?: string; title?: string; body?: string; id?: number | string; key?: string };
  if (!e.title) return null;
  // Where each kind of arrival opens in the workspace.
  const href =
    e.kind === "message" && e.key ? `/dashboard/messages?thread=${encodeURIComponent(e.key)}`
    : e.kind === "cover" && e.id ? `/dashboard/cover?plan=${e.id}`
    : e.kind === "referral" && e.id ? `/dashboard/referrals?referral=${e.id}`
    : e.kind === "consult" && e.id ? `/dashboard/consult?discussion=${e.id}`
    : "/dashboard";
  return { kind: e.kind || "message", title: e.title, body: e.body || "", href, action: "Open" };
}
