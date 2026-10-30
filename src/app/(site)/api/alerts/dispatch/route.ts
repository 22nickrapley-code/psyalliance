import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendPush, sendSms } from "@/lib/alerts";

// Called every minute by a scheduler with the shared secret. Not for browsers.
export async function POST(req: Request) {
  const secret = process.env.ALERT_DISPATCH_SECRET;
  if (!secret || req.headers.get("x-dispatch-secret") !== secret) return NextResponse.json({ error: "No" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("claim_alerts", { p_limit: 25 });
  if (error) return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  let sent = 0, failed = 0;
  for (const r of (data || []) as any[]) {
    const res = r.channel === "push" ? await sendPush(r.endpoint) : await sendSms(r.phone, `${r.body} psyalliance.org/dashboard`);
    await db.rpc("finish_alert", { p_delivery: r.delivery_id, p_ok: res.ok, p_error: res.error ?? null, p_gone_endpoint: res.gone ? r.endpoint : null });
    res.ok ? sent++ : failed++;
  }
  return NextResponse.json({ claimed: (data || []).length, sent, failed });
}
