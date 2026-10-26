import "../../premium.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { InviteLanding } from "./view";

export const metadata = { title: "You're invited", robots: { index: false, follow: false } };

// A colleague's personal invitation. One way forward: create an account
// (or sign in) and you're connected, as each other's trusted colleagues.
export default async function InvitationPage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token: raw } = await props.params;
  const token = raw.replace(/[^a-f0-9]/gi, "").slice(0, 64);
  if (IS_DEMO_SITE) redirect(`${REAL_SITE_URL}/i/${token}`);
  const { error } = await props.searchParams;
  const supabase = await createClient();
  const [{ data: info }, { data: auth }] = await Promise.all([supabase.rpc("member_invite_info", { p_token: token }), supabase.auth.getUser()]);
  return <InviteLanding who={(info as any) || null} token={token} signedIn={!!auth?.user} error={error} />;
}
