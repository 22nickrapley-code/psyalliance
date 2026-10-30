import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Saves (or removes) this device's push subscription for the signed-in member only.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const endpoint = String(b?.endpoint || ""), p256dh = String(b?.keys?.p256dh || ""), auth = String(b?.keys?.auth || "");
  if (!/^https?:\/\//.test(endpoint) || !p256dh || !auth) return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  const { error } = await supabase.from("push_subscriptions").upsert({ profile_id: user.id, endpoint, p256dh, auth, user_agent: (req.headers.get("user-agent") || "").slice(0, 200), revoked_at: null }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  await supabase.rpc("set_my_participation", { p: { alertPush: true } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const q = supabase.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("profile_id", user.id);
  await (b?.endpoint ? q.eq("endpoint", String(b.endpoint)) : q);
  await supabase.rpc("set_my_participation", { p: { alertPush: false } });
  return NextResponse.json({ ok: true });
}
