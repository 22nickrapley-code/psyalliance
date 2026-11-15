"use server";

import { createClient } from "@/lib/supabase/server";
import { handlers, type Result } from "./handlers";
// AI (v4): self-contained; switched on and off from the admin portal. Remove this line and ai.ts to take AI out.
import { aiHandlers } from "./ai";

// The single door the workspace's browser code uses to change anything.
export async function workspaceCall(name: string, args: unknown, expectUser?: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again.", signedOut: true };
  // v11 (QA M8): this page was opened for another member, and someone else has since signed in in this browser.
  // Nothing is done as the new member from the old page; it reloads and shows who is signed in now.
  if (expectUser && expectUser !== user.id) return { ok: false, error: "Someone else is now signed in on this browser. Reloading.", switched: true } as Result;
  if (name === "session.ping") return { ok: true };
  const handler = handlers[name] || aiHandlers[name];
  if (!handler) return { ok: false, error: "That isn't available." };
  try {
    return await handler({ supabase, userId: user.id }, (args ?? {}) as any);
  } catch (e) {
    console.error(`workspace ${name}:`, e instanceof Error ? e.message : e);
    return { ok: false, error: "That didn't save, so nothing was changed. Please try again." };
  }
}
