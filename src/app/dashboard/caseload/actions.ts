"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractStructuredData, AiNotConfiguredError } from "@/lib/ai/anthropic";

export type ImportedCaseRow = {
  private_label: string | null;
  organization_name: string | null;
  state: string | null;
  city: string | null;
  session_type: string | null;
  insurance: string | null;
  primary_need: string | null;
  secondary_need: string | null;
  tertiary_need: string | null;
  rate_per_session: number | null;
  sessions_per_week: number | null;
};

export async function createBookOfBusiness(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const name = String(formData.get("name") || "");
  const retentionPct = parseFloat(String(formData.get("expense_burden_pct") || "1"));

  const { error } = await supabase.from("books_of_business").insert({
    profile_id: user.id,
    name,
    expense_burden_pct: retentionPct,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}

// Soft-delete only: caseload_clients.book_of_business_id has no ON DELETE
// clause, so a hard DELETE here would fail (or worse, be silently blocked)
// once any case references this organization. Reusing the existing
// is_active flag mirrors archiveCase below and keeps historical cases intact.
export async function deleteOrganization(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = Number(formData.get("id"));

  const { error } = await supabase
    .from("books_of_business")
    .update({ is_active: false })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}

export async function createCase(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const bookId = formData.get("book_of_business_id");

  const { error } = await supabase.from("caseload_clients").insert({
    profile_id: user.id,
    book_of_business_id: bookId ? Number(bookId) : null,
    private_label: String(formData.get("private_label") || "") || null,
    state: String(formData.get("state") || "") || null,
    city: String(formData.get("city") || "") || null,
    session_type: String(formData.get("session_type") || "") || null,
    insurance: String(formData.get("insurance") || "") || null,
    primary_need: String(formData.get("primary_need") || "") || null,
    secondary_need: String(formData.get("secondary_need") || "") || null,
    tertiary_need: String(formData.get("tertiary_need") || "") || null,
    rate_per_session: parseFloat(String(formData.get("rate_per_session") || "0")) || null,
    sessions_per_week: parseFloat(String(formData.get("sessions_per_week") || "0")) || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}

// Optional convenience, not the required way to build a caseload: turns a
// pasted spreadsheet/CSV export (from Excel, or copied out of an insurance
// panel's dashboard) into a list of candidate rows for review. Nothing is
// written to the database here - parseCaseloadImport only proposes rows;
// the practitioner reviews and picks what to import via bulkImportCases.
export async function parseCaseloadImport(rawText: string): Promise<{
  rows?: ImportedCaseRow[];
  error?: string;
}> {
  const trimmed = rawText.trim();
  if (!trimmed) return { error: "Paste or upload some caseload data first." };
  if (trimmed.length > 40000) {
    return { error: "That file/text is too large to parse in one go (max ~40,000 characters) - try a smaller batch." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const [{ data: orgs }, { data: specialisms }] = await Promise.all([
    supabase.from("books_of_business").select("name").eq("profile_id", user.id).eq("is_active", true),
    supabase.from("lookup_values").select("value").eq("category", "treatment_specialism").order("value"),
  ]);
  const orgNames = (orgs || []).map((o) => o.name);
  const specialismValues = (specialisms || []).map((s) => s.value);

  try {
    const result = await extractStructuredData<{ cases?: any[] }>({
      system:
        "You extract a list of case rows from caseload data a psychologist/psychiatrist pasted or uploaded themselves (a spreadsheet export, an insurance panel dashboard export, or a plain description). CRITICAL PRIVACY RULE: never output a real client name. If the source contains a client's name, convert it to initials only (e.g. 'John Smith' -> 'JS', max 24 characters) for private_label - never the full name, and never any other identifying detail (no DOB, no SSN, no address). Only extract rows that are clearly individual cases/clients; skip totals, headers, or summary rows. Never invent data not present in the source.",
      userContent: `Caseload data:\n"""\n${trimmed}\n"""\n\nThe practitioner's existing organizations (match organization_name to one of these if it clearly corresponds, otherwise leave organization_name as whatever the source calls it): ${orgNames.join(", ") || "(none yet)"}\n\nAllowed specialism values for primary/secondary/tertiary need (match to the closest one of these if applicable, otherwise omit): ${specialismValues.join(", ")}`,
      toolName: "extract_caseload_rows",
      toolDescription: "Extract a list of case rows from pasted/uploaded caseload data.",
      inputSchema: {
        type: "object",
        properties: {
          cases: {
            type: "array",
            items: {
              type: "object",
              properties: {
                private_label: { type: "string", description: "Initials only, max 24 chars - never a full name" },
                organization_name: { type: "string" },
                state: { type: "string" },
                city: { type: "string" },
                session_type: { type: "string", enum: ["F2F", "Virtual"] },
                insurance: { type: "string" },
                primary_need: { type: "string" },
                secondary_need: { type: "string" },
                tertiary_need: { type: "string" },
                rate_per_session: { type: "number" },
                sessions_per_week: { type: "number" },
              },
            },
          },
        },
        required: ["cases"],
      },
    });

    const rows: ImportedCaseRow[] = (result.cases || []).map((c: any) => ({
      private_label: c.private_label ? String(c.private_label).slice(0, 24) : null,
      organization_name: c.organization_name || null,
      state: c.state || null,
      city: c.city || null,
      session_type: c.session_type || null,
      insurance: c.insurance || null,
      primary_need: c.primary_need || null,
      secondary_need: c.secondary_need || null,
      tertiary_need: c.tertiary_need || null,
      rate_per_session: typeof c.rate_per_session === "number" ? c.rate_per_session : null,
      sessions_per_week: typeof c.sessions_per_week === "number" ? c.sessions_per_week : null,
    }));

    if (rows.length === 0) return { error: "Didn't find any case rows in that data." };
    return { rows };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Something went wrong parsing that data." };
  }
}

// The practitioner's own review/confirm step - only rows they kept checked
// in the import preview reach here, and only then does anything get written.
export async function bulkImportCases(rows: ImportedCaseRow[]): Promise<{ imported?: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!Array.isArray(rows) || rows.length === 0) return { error: "No rows to import." };

  const { data: orgs } = await supabase
    .from("books_of_business")
    .select("id, name")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const orgIdByLowerName = new Map((orgs || []).map((o) => [o.name.toLowerCase(), o.id]));

  const insertRows = rows.slice(0, 200).map((r) => ({
    profile_id: user.id,
    book_of_business_id: r.organization_name ? orgIdByLowerName.get(r.organization_name.toLowerCase()) ?? null : null,
    private_label: r.private_label,
    state: r.state,
    city: r.city,
    session_type: r.session_type,
    insurance: r.insurance,
    primary_need: r.primary_need,
    secondary_need: r.secondary_need,
    tertiary_need: r.tertiary_need,
    rate_per_session: r.rate_per_session,
    sessions_per_week: r.sessions_per_week,
  }));

  const { error } = await supabase.from("caseload_clients").insert(insertRows);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
  return { imported: insertRows.length };
}

// Self-service "request to add" for the Insurance dropdown - the canonical
// list itself only grows through admin review (see
// dashboard/admin/insurance-requests), same reasoning as credential
// verification being human-reviewed rather than auto-approved.
export async function requestNewInsurance(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const value = String(formData.get("requested_value") || "").trim();
  if (!value) throw new Error("Enter the insurance provider's name first.");
  if (value.length > 120) throw new Error("That name is too long.");

  const { error } = await supabase.from("insurance_requests").insert({
    requested_by: user.id,
    requested_value: value,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/caseload");
  redirect("/dashboard/caseload?insurance_requested=1");
}

export async function archiveCase(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase
    .from("caseload_clients")
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}

// Nick's Sept 20 feedback: re-engaging a past client shouldn't mean
// re-typing everything from scratch. Un-archiving keeps the same case
// number and all its details (organization, rate, needs, etc.) rather than
// inserting a fresh row - RLS ("own cases only") already scopes this to the
// caller's own rows, .eq("profile_id", ...) below is belt-and-braces.
export async function reactivateCase(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = Number(formData.get("id"));

  const { error } = await supabase
    .from("caseload_clients")
    .update({ is_active: true, archived_at: null })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}
