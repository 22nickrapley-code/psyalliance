"use server";

import { createClient } from "@/lib/supabase/server";
import { handlers, type Result } from "./handlers";
// AI (v4): self-contained; switched on and off from the admin portal. Remove this line and ai.ts to take AI out.
import { aiHandlers } from "./ai";

// The single door the workspace's browser code uses to change anything.
export async function workspaceCall(name: string, args: unknown): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again.", signedOut: true };
  const handler = handlers[name] || aiHandlers[name];
  if (!handler) return { ok: false, error: "That isn't available." };
  try {
    return await handler({ supabase, userId: user.id }, (args ?? {}) as any);
  } catch (e) {
    console.error(`workspace ${name}:`, e instanceof Error ? e.message : e);
    return { ok: false, error: "That didn't save, so nothing was changed. Please try again." };
  }
}
