import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Read by the service worker when a push arrives: the wording is fetched while signed in, never carried by the push.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_latest_alert");
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ body: row?.body || "You have something waiting in PsyAlliance. Review request.", link: row?.link || "/dashboard" }, { headers: { "cache-control": "no-store" } });
}
