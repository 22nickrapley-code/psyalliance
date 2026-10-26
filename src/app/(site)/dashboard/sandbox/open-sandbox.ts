import { DEMO_URL, IS_DEMO_SITE, SANDBOX_SUPABASE_KEY, SANDBOX_SUPABASE_URL } from "@/lib/env";

// Where "Open your sandbox" goes: a private copy of PsyAlliance with
// fictional colleagues on the sandbox site. One per account, reused until it
// expires (7 days), then a fresh one. Nothing from the real account goes
// there except the email as a label, so the sandbox admin can tell whose
// sandbox it is. Returns the address to send the member to.
const unavailable = (message = "The sandbox isn't available right now. Please try again shortly.") => `/dashboard?sandbox_error=${encodeURIComponent(message)}`;

export async function sandboxDestination(supabase: any, user: { id: string; email?: string | null } | null): Promise<string> {
  if (IS_DEMO_SITE || !DEMO_URL) return "/dashboard";
  if (!user) return "/auth/sign-in";

  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: link } = await supabase.from("sandbox_links").select("token, expires_at").eq("profile_id", user.id).maybeSingle();
  if (link && link.expires_at > soon) return `${DEMO_URL}/sandbox/${link.token}`;

  let token: string | null = null;
  try {
    const res = await fetch(`${SANDBOX_SUPABASE_URL}/rest/v1/rpc/start_sandbox`, {
      method: "POST",
      headers: { apikey: SANDBOX_SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_label: user.email || user.id }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return unavailable(typeof body?.message === "string" ? body.message : undefined);
    token = typeof body === "string" ? body : null;
  } catch {
    token = null;
  }
  if (!token) return unavailable();

  const expires = new Date(Date.now() + 7 * 86_400_000 - 5 * 60 * 1000).toISOString();
  await supabase.from("sandbox_links").upsert({ profile_id: user.id, token, expires_at: expires }, { onConflict: "profile_id" });
  return `${DEMO_URL}/sandbox/${token}`;
}
