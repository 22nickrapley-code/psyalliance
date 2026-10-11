import type { createClient } from "@/lib/supabase/server";
import { IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { clinicianName } from "@/lib/profession";

// What the invite box needs: the link to send and how to sign the message.
// A real member sends their own link (/i/<token>), which connects them as
// trusted colleagues once both are verified. The sandbox sends the main
// site, unsigned (the sandbox profile is a fictional person).
export type InviteInfo = {
  link: string;
  mode: "member" | "general" | "sandbox";
  firstName: string | null;
  fullName: string | null;
};

export async function loadInvite(supabase: Awaited<ReturnType<typeof createClient>>): Promise<InviteInfo> {
  if (IS_DEMO_SITE) return { link: REAL_SITE_URL, mode: "sandbox", firstName: null, fullName: null };
  const [{ data: token }, { data: me }] = await Promise.all([
    supabase.rpc("my_invite_link"),
    supabase.rpc("my_profile").select("full_name, credential_prefix, qualification_level").maybeSingle<any>(),
  ]);
  const fullName = me?.full_name ? clinicianName(me.full_name, me.qualification_level, me.credential_prefix) : null;
  const firstName = me?.full_name ? String(me.full_name).trim().split(/\s+/)[0] : null;
  return token
    ? { link: `${REAL_SITE_URL}/i/${token}`, mode: "member", firstName, fullName }
    : { link: REAL_SITE_URL, mode: "general", firstName, fullName };
}
