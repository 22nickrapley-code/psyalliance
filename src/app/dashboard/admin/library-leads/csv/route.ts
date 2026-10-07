import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { filterLeads, type LeadsData } from "../load";

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Library leads as a CSV for follow-up by hand. The database refuses
// anyone who isn't an admin.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_library_leads");
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  const d = (data as LeadsData) || { leads: [], joins: {} };
  const doc = req.nextUrl.searchParams.get("doc") || "";
  const intent = req.nextUrl.searchParams.get("intent") || "";
  const rows = filterLeads(d.leads || [], doc, intent).map((l) => [l.created_at, l.library_code, l.intent, l.full_name, l.email, l.role, l.state, l.source]);
  const header = ["Created", "Template", "Asked for", "Name", "Email", "Role", "State", "Source"];
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="psyalliance-library-leads.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
