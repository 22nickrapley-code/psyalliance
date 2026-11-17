import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { phoneAlertsOn } from "@/lib/alerts";

// v17: one test alert to the signed-in member's own devices (at most one a minute). The usual sender delivers it.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (!phoneAlertsOn()) return NextResponse.json({ ok: false, error: "Phone alerts are not available yet." }, { status: 403 });
  const { data, error } = await supabase.rpc("send_test_alert");
  if (error) return NextResponse.json({ ok: false, error: "We could not send a test alert. Please try again." }, { status: 500 });
  return NextResponse.json(data);
}
