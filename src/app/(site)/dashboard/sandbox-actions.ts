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
  const e = data as Partial<SandboxEvent>;
  if (!e.title) return null;
  return { kind: e.kind || "message", title: e.title, body: e.body || "", href: e.href || "/dashboard", action: e.action || "Open" };
}
