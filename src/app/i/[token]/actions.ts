"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// A signed-in member accepts a colleague's invitation link.
export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") || "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/i/${token}`)}`);
  const { data, error } = await supabase.rpc("accept_member_invite", { p_token: token });
  if (error) redirect(`/i/${token}?error=${encodeURIComponent(error.message)}`);
  const r = (data || {}) as { inviter?: string; connected?: boolean; self?: boolean };
  if (r.self) redirect("/dashboard/invite");
  revalidatePath("/dashboard/network");
  if (r.connected && r.inviter) redirect(`/dashboard/people/${r.inviter}?connected=1`);
  redirect("/dashboard?invite=waiting");
}
