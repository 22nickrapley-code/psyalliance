import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Records one privacy-minimised guide event: a name and a need, in the "demo" namespace. No identity, no text.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const supabase = await createClient();
  await supabase.rpc("log_lifecycle_event", { p_namespace: "demo", p_event: String(b?.event || "").slice(0, 40), p_need: b?.need ? String(b.need).slice(0, 20) : null });
  return new NextResponse(null, { status: 204 });
}
