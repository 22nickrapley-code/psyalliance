import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO_SITE } from "@/lib/env";
import type { LiveBoot, WorkspaceView } from "../adapters/live";
import { shapeLibrary } from "./library";

// Loads the signed-in member's workspace in one request, as that member
// (their own session; row-level security and the database's own rules
// apply). Anyone the workspace is not for is sent to the existing screens.
export async function loadWorkspaceBoot(path: string): Promise<LiveBoot> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const jar = await cookies();
    if (IS_DEMO_SITE && jar.get("pa_pass")?.value && !jar.get("pa_resumed")?.value) redirect(`/sandbox/resume?next=${encodeURIComponent(path)}`);
    redirect(IS_DEMO_SITE ? "/sandbox/ended" : "/auth/sign-in");
  }
  const { data, error } = await supabase.rpc("workspace_boot");
  if (error) throw new Error(`workspace_boot: ${error.message}`);
  const boot = data as any;
  if (!boot) redirect(IS_DEMO_SITE ? "/sandbox/ended" : "/auth/sign-in");
  if (boot.gate === "no_profile") redirect("/dashboard/profile");
  if (boot.gate === "operator") redirect("/dashboard/admin");
  if (boot.gate === "waiting") redirect("/dashboard/overview");
  const { saved, ...rest } = boot;
  return { ...rest, ...shapeLibrary({ resources: boot.resources, saved }), demo: IS_DEMO_SITE, userId: user.id } as LiveBoot;
}

export type { WorkspaceView };
