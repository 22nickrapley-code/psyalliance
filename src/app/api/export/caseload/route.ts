import { createClient } from "@/lib/supabase/server";
import { caseMonthlyGross, caseMonthlyNet } from "@/lib/finance";
import { NextResponse } from "next/server";

// A plain CSV download of the signed-in user's own caseload - no patient
// names ever leave this table (case number + optional private label only),
// so this is safe to hand to an accountant or move into a spreadsheet at
// tax time. Deliberately a Route Handler rather than a Server Action:
// actions can't trigger a file download, only a GET response with
// Content-Disposition can.
function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [{ data: cases }, { data: books }] = await Promise.all([
    supabase
      .from("caseload_clients")
      .select("*, books_of_business(name)")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("books_of_business").select("*").eq("profile_id", user.id),
  ]);

  const header = [
    "Case number",
    "Private label",
    "Book of business",
    "Active",
    "City",
    "State",
    "Session type",
    "Insurance",
    "Primary need",
    "Secondary need",
    "Tertiary need",
    "Rate per session",
    "Sessions per week",
    "Monthly gross",
    "Monthly net",
    "Created at",
  ];

  const rows = (cases || []).map((c: any) => {
    const gross = caseMonthlyGross(c);
    const net = caseMonthlyNet(c, books || []);
    return [
      `Case #${c.id}`,
      c.private_label || "",
      c.books_of_business?.name || "",
      c.is_active ? "Yes" : "No",
      c.city || "",
      c.state || "",
      c.session_type || "",
      c.insurance || "",
      c.primary_need || "",
      c.secondary_need || "",
      c.tertiary_need || "",
      c.rate_per_session ?? "",
      c.sessions_per_week ?? "",
      gross.toFixed(2),
      net.toFixed(2),
      c.created_at,
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="psyalliance-caseload-export.csv"`,
    },
  });
}
