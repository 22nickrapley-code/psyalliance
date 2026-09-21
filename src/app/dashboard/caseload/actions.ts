"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractStructuredData, AiNotConfiguredError } from "@/lib/ai/anthropic";
import { computeGridRankedCandidates } from "@/lib/server-matching";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function caseloadError(message: string): never {
  redirect(`/dashboard/caseload?error=${encodeURIComponent(message)}`);
}

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
  if (error) caseloadError(error.message);

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
  if (error) caseloadError(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}

// Every active client must belong to a practice, or be archived - there is
// no accepted "unassigned" state (Nick's explicit rule). createCase and
// updateCase below both reject a missing book_of_business_id rather than
// silently allowing null the way they used to.
export async function createCase(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const bookId = formData.get("book_of_business_id");
  if (!bookId) {
    caseloadError("Pick a practice for this client first - add one below under Practices if you haven't yet.");
  }

  const { error } = await supabase.from("caseload_clients").insert({
    profile_id: user.id,
    book_of_business_id: Number(bookId),
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
  if (error) caseloadError(error.message);

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
//
// Every imported row needs a practice, same rule as createCase/updateCase.
// Matches the extracted organization_name against an existing practice
// (case-insensitively), auto-creates a new practice for any name that
// doesn't match one yet, and falls back to the practitioner's sole existing
// practice for rows where the source didn't name an organization at all.
// Only fails outright if there are zero practices to fall back to, or a
// row's organization can't be resolved and there's more than one practice
// to guess between.
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
  const orgList = orgs || [];
  if (orgList.length === 0) {
    return { error: "Add at least one practice under Practices before importing - every client needs one." };
  }
  const orgIdByLowerName = new Map(orgList.map((o) => [o.name.toLowerCase(), o.id as number]));
  const soleBookId = orgList.length === 1 ? orgList[0].id : null;

  const newOrgNamesNeeded = new Set<string>();
  for (const r of rows) {
    if (r.organization_name && !orgIdByLowerName.has(r.organization_name.toLowerCase())) {
      newOrgNamesNeeded.add(r.organization_name);
    }
  }
  if (newOrgNamesNeeded.size > 0) {
    const { data: created, error: createErr } = await supabase
      .from("books_of_business")
      .insert(
        Array.from(newOrgNamesNeeded).map((name) => ({
          profile_id: user.id,
          name,
          expense_burden_pct: 0.85,
        }))
      )
      .select("id, name");
    if (createErr) return { error: createErr.message };
    for (const o of created || []) orgIdByLowerName.set(o.name.toLowerCase(), o.id);
  }

  const unresolved: string[] = [];
  const insertRows = rows.slice(0, 200).map((r) => {
    let bookId = r.organization_name ? orgIdByLowerName.get(r.organization_name.toLowerCase()) ?? null : null;
    if (!bookId) bookId = soleBookId;
    if (!bookId) unresolved.push(r.private_label || r.organization_name || "an unlabeled row");
    return {
      profile_id: user.id,
      book_of_business_id: bookId,
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
    };
  });

  if (unresolved.length > 0) {
    return {
      error:
        `Couldn't tell which practice ${unresolved.length === 1 ? "this client belongs" : "these clients belong"} to ` +
        `(no organization in the source data, and you have more than one practice): ${unresolved.slice(0, 5).join(", ")}` +
        `${unresolved.length > 5 ? ", …" : ""}. Add the practice name to that row's data and re-import, or import ` +
        `one practice at a time.`,
    };
  }

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
  if (!value) caseloadError("Enter the insurance provider's name first.");
  if (value.length > 120) caseloadError("That name is too long.");

  const { error } = await supabase.from("insurance_requests").insert({
    requested_by: user.id,
    requested_value: value,
  });
  if (error) caseloadError(error.message);

  revalidatePath("/dashboard/caseload");
  redirect("/dashboard/caseload?insurance_requested=1");
}

// Nick's Sept 20 feedback: once a client was added, nothing about them
// could be changed - rate, sessions/week, organization, etc. were locked
// in forever. This lets every field on an active client be edited in
// place from the Active clients list, like editing a row in a
// spreadsheet. Income/Capacity/Overview all compute their numbers live
// from these same columns on every page load, so saving a new rate or
// sessions/week here is immediately reflected everywhere else - no
// separate "recalculate" step needed.
export async function updateCase(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = Number(formData.get("id"));
  const bookId = formData.get("book_of_business_id");
  if (!bookId) {
    caseloadError("Every client needs a practice - pick one, or archive this client instead.");
  }

  const { error } = await supabase
    .from("caseload_clients")
    .update({
      book_of_business_id: Number(bookId),
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
    })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) caseloadError(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
  revalidatePath("/dashboard/capacity");
  revalidatePath("/dashboard");
}

export async function archiveCase(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase
    .from("caseload_clients")
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) caseloadError(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}

// Nick's Sept 20 feedback: re-engaging a past client shouldn't mean
// re-typing everything from scratch. Un-archiving keeps the same case
// number and all its details (organization, rate, needs, etc.) rather than
// inserting a fresh row - RLS ("own cases only") already scopes this to the
// caller's own rows, .eq("profile_id", ...) below is belt-and-braces.
// "Quick Match" on the Caseload (Data) section - given a treatment area
// (from clicking a pie slice), returns the practitioner's top ranked
// colleagues for that specialism via the Match Grid (relationship tier +
// specialty rating), so they can see who to route similar cases to or loop
// in for a consult. No state/session-type filtering here - this is a
// caseload-wide "who treats this" view, not a single-client match (that's
// the Single Patient Referral tool and the Planner recommendation table).
export async function getCaseloadQuickMatch(specialismValue: string): Promise<{
  candidates?: Array<{
    profileId: string;
    fullName: string;
    connectionTier: string;
    gridScore: number;
    city: string | null;
    state: string | null;
  }>;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!specialismValue) return { error: "Pick a treatment area first." };

  const ranked = await computeGridRankedCandidates(supabase, user.id, { specialismValue });
  return {
    candidates: ranked.slice(0, 8).map((c) => ({
      profileId: c.profileId,
      fullName: c.fullName,
      connectionTier: c.connectionTier,
      gridScore: c.gridScore,
      city: c.city,
      state: c.state,
    })),
  };
}

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
  if (error) caseloadError(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}
