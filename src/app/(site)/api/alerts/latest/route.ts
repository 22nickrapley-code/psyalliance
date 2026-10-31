import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Read by the service worker when a push arrives. It sends its own subscription endpoint and gets back the alerts
// sent to THIS device that it has not shown yet, each with its own wording and link (review F01). Signed in only;
// another account's endpoint returns nothing. The push itself carries no text.
export async function POST(req: Request) {
  const supabase = await createClient();
  const b = await req.json().catch(() => null);
  const endpoint = String(b?.endpoint || "").slice(0, 1000);
  const { data } = endpoint ? await supabase.rpc("my_device_alerts", { p_endpoint: endpoint }) : { data: [] };
  const alerts = ((data as any[]) || []).map((r) => ({ id: r.id, body: r.body, link: typeof r.link === "string" && r.link.startsWith("/") ? r.link : "/dashboard" }));
  return NextResponse.json({ alerts }, { headers: { "cache-control": "no-store" } });
}
