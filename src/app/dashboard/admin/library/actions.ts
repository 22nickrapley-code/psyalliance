"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setDocumentGovernance, publishDocument, type ReviewerRole } from "@/lib/library-governance";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Practice Library governance (admin side): which reviewer roles each
// resource needs, who is appointed to review, and publishing once every
// required role has an independent approval. Reviews themselves are
// recorded by the appointed reviewers at /dashboard/documents/review.

const ALL_ROLES: ReviewerRole[] = ["clinical", "legal_regulatory", "privacy_security", "prescribing"];

function libraryError(message: string): never {
  redirect(`/dashboard/admin/library?error=${encodeURIComponent(message)}`);
}

export async function setRequiredReviewerRolesAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  const requiredReviewerRoles = ALL_ROLES.filter((role) => formData.get(`role_${role}`) === "on");

  const { error } = await setDocumentGovernance(supabase, documentId, { requiredReviewerRoles });
  if (error) libraryError(error);

  revalidatePath("/dashboard/admin/library");
  redirect("/dashboard/admin/library");
}

// Reviewer appointments. The database enforces who qualifies for each
// role and that an admin can't appoint themselves (guard_library_reviewer).
export async function appointReviewerAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const profileId = String(formData.get("profile_id") || "");
  const role = String(formData.get("role") || "") as ReviewerRole;
  const qualification = String(formData.get("qualification") || "").trim();
  if (!profileId || !ALL_ROLES.includes(role)) libraryError("Choose a person and a role");
  if (qualification.length < 5) libraryError("Say what qualifies them, for example their license or bar admission");

  const { error } = await supabase
    .from("library_reviewers")
    .upsert({ profile_id: profileId, role, qualification, active: true }, { onConflict: "profile_id,role" });
  if (error) libraryError(error.message);
  revalidatePath("/dashboard/admin/library");
  redirect("/dashboard/admin/library?appointed=1");
}

export async function setReviewerActiveAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const id = Number(formData.get("id"));
  const active = formData.get("active") === "true";
  const { error } = await supabase.from("library_reviewers").update({ active }).eq("id", id);
  if (error) libraryError(error.message);
  revalidatePath("/dashboard/admin/library");
  redirect("/dashboard/admin/library");
}

export async function publishDocumentAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  const { error } = await publishDocument(supabase, documentId);
  if (error) libraryError(error);

  revalidatePath("/dashboard/admin/library");
  revalidatePath("/dashboard/documents");
  redirect("/dashboard/admin/library");
}

// Hide a resource from members (needs_review), or show an unreviewed one
// as provisional: visible, clearly labelled as not yet independently
// reviewed. Neither needs approvals; only "published" does.
export async function setResourceVisibilityAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  const status = String(formData.get("status") || "");
  if (!["provisional", "needs_review"].includes(status)) libraryError("Unknown status");
  const { error } = await supabase.from("documents").update({ review_status: status, review_date: null }).eq("id", documentId);
  if (error) libraryError(error.message);

  revalidatePath("/dashboard/admin/library");
  revalidatePath("/dashboard/documents");
  redirect("/dashboard/admin/library");
}

// Task #120 (Sept 23 audit): seed the PA-01..20 Practice Library starter set
// Nick provided. Originally scoped as a standalone script needing
// SUPABASE_SERVICE_ROLE_KEY to bypass Storage RLS for a bulk upload - but
// uploadDocument() (documents/actions.ts) already shows that any signed-in
// user's own cookie-based session can write to the shared/ storage path, no
// service-role key needed. Reusing that same authenticated-upload path here
// means this only needs an admin to click the button while signed in - no
// credential ever passes through Claude, and Nick doesn't need a terminal.
//
// Reads the 20 PDFs + manifest.csv from seed-data/PsyAlliance-Shared-Library-
// Starter-Set/ (checked into the repo) via the local filesystem, which only
// works when this runs against a real Node.js process with normal disk
// access - i.e. `npm run dev` (or a traditional Node deploy), not the
// deployed Cloudflare Workers site, which has no filesystem to read a
// bundled folder from at request time. Fails with a clear message rather
// than a crash if the folder isn't found, so running this against the
// wrong environment is obvious, not confusing.
const STARTER_LIBRARY_DIR = join(process.cwd(), "seed-data", "PsyAlliance-Shared-Library-Starter-Set");

// Same first-pass reviewer-role mapping as the original standalone script -
// see scripts/seed-practice-library.mjs's comment for the reasoning
// (Addendum A6 leaves the exact taxonomy to be settled operationally).
const STARTER_LIBRARY_ROLES: Record<string, ReviewerRole[]> = {
  "PA-01": ["clinical", "legal_regulatory"],
  "PA-02": ["clinical", "legal_regulatory"],
  "PA-03": ["clinical", "legal_regulatory"],
  "PA-04": ["clinical"],
  "PA-05": ["clinical"],
  "PA-06": ["clinical", "legal_regulatory"],
  "PA-07": ["clinical", "legal_regulatory"],
  "PA-08": ["clinical", "prescribing"],
  "PA-09": ["clinical", "legal_regulatory"],
  "PA-10": ["clinical", "legal_regulatory"],
  "PA-11": ["clinical", "legal_regulatory", "privacy_security"],
  "PA-12": ["clinical", "legal_regulatory"],
  "PA-13": ["clinical", "legal_regulatory"],
  "PA-14": ["legal_regulatory", "prescribing"],
  "PA-15": ["legal_regulatory"],
  "PA-16": ["legal_regulatory"],
  "PA-17": ["legal_regulatory", "privacy_security"],
  "PA-18": ["legal_regulatory", "privacy_security"],
  "PA-19": ["legal_regulatory"],
  "PA-20": ["legal_regulatory"],
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseManifestCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

export async function seedStarterLibraryAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  if (!existsSync(STARTER_LIBRARY_DIR)) {
    libraryError(
      "Couldn't find the starter library files on disk. This only works running locally (npm run dev), not on the deployed site."
    );
  }

  let manifestRows: Record<string, string>[];
  try {
    const manifestText = readFileSync(join(STARTER_LIBRARY_DIR, "manifest.csv"), "utf8");
    manifestRows = parseManifestCsv(manifestText);
  } catch (e: any) {
    libraryError(`Couldn't read manifest.csv: ${e?.message || "unknown error"}`);
  }

  // Idempotent: a document from a previous run carries its PA number in
  // library_code, so a re-click (or a partial prior run) doesn't duplicate.
  const { data: existing } = await supabase
    .from("documents")
    .select("library_code")
    .eq("owner_scope", "world")
    .not("library_code", "is", null);
  const existingIds = new Set((existing || []).map((d: any) => d.library_code));

  let seeded = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const row of manifestRows) {
    const { id, filename, title, category, audience, summary, tags } = row;
    if (existingIds.has(id)) {
      skipped++;
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = readFileSync(join(STARTER_LIBRARY_DIR, filename));
    } catch (e: any) {
      failures.push(`${id} (read): ${e?.message || "unknown error"}`);
      continue;
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `shared/${user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf" });
    if (uploadError) {
      failures.push(`${id} (upload): ${uploadError.message}`);
      continue;
    }

    const requiredRoles = STARTER_LIBRARY_ROLES[id] || ["clinical"];
    const { error: insertError } = await supabase.from("documents").insert({
      profile_id: user.id,
      owner_scope: "world",
      title,
      library_code: id,
      summary: summary || null,
      category: category || null,
      audience: audience || null,
      tags: (tags || "").split(";").map((t) => t.trim()).filter(Boolean),
      publish_date: new Date().toISOString().slice(0, 10),
      storage_path: storagePath,
      uploaded_by: user.id,
      is_general: true,
      resource_owner_id: user.id,
      version: 1,
      sources: "PsyAlliance Shared Library Starter Set (provided by Nick Rapley, Sept 2026)",
      applicability: `${audience} - ${category}`,
      customization_warning:
        "Template - review and adapt to your state's requirements, your practice's actual policies, and current law before use. Not a substitute for your own legal/compliance review.",
      // Visible to members, labelled "Provisional, not yet independently
      // reviewed", until appointed reviewers sign it off (0081).
      review_status: "provisional",
      required_reviewer_roles: requiredRoles,
    });
    if (insertError) {
      failures.push(`${id} (insert): ${insertError.message}`);
      // Clean up the just-uploaded file so a failed insert doesn't leave an
      // orphaned, unreferenced object in Storage behind.
      await supabase.storage.from("documents").remove([storagePath]);
      continue;
    }

    seeded++;
  }

  revalidatePath("/dashboard/admin/library");

  const params = new URLSearchParams({ seeded: String(seeded), skipped: String(skipped) });
  if (failures.length > 0) params.set("error", `${failures.length} failed: ${failures.join("; ")}`);
  redirect(`/dashboard/admin/library?${params.toString()}`);
}

// The public Library page for one template: listed or not, free to
// download or not (only once published; the database refuses otherwise),
// and the "What's inside" list, one item per line.
export async function setLibraryPublicAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  const contents = String(formData.get("contents") || "")
    .split(/\r?\n/)
    .map((x) => x.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
  const { error } = await supabase.rpc("admin_set_library_public", {
    p_document: documentId,
    p_listed: formData.get("listed") === "1",
    p_download: formData.get("download") === "1",
    p_contents: contents,
  });
  if (error) libraryError(error.message);

  revalidatePath("/dashboard/admin/library");
  revalidatePath("/library");
  redirect("/dashboard/admin/library?public=1");
}

// Replace each template's file with the current one in the repository's
// starter set (for example after the PA numbers were taken out of the
// PDFs). Uploads under the new file name, points the template at it and
// removes the old file. Members' working copies are untouched. Like the
// seed button, it reads the repository, so it only works running locally.
export async function refreshLibraryFilesAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  if (!existsSync(STARTER_LIBRARY_DIR)) {
    libraryError("Couldn't find the library files on disk. This only works running locally (npm run dev), not on the deployed site.");
  }
  let rows: Record<string, string>[];
  try {
    rows = parseManifestCsv(readFileSync(join(STARTER_LIBRARY_DIR, "manifest.csv"), "utf8"));
  } catch (e: any) {
    libraryError(`Couldn't read manifest.csv: ${e?.message || "unknown error"}`);
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("id, library_code, storage_path")
    .eq("owner_scope", "world")
    .not("library_code", "is", null);
  const byCode = new Map((docs || []).map((d: any) => [d.library_code, d]));

  let updated = 0;
  let current = 0;
  const failures: string[] = [];
  for (const row of rows) {
    const doc: any = byCode.get(row.id);
    if (!doc) continue;
    const safeName = row.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (String(doc.storage_path).endsWith(`-${safeName}`)) {
      current++;
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(STARTER_LIBRARY_DIR, row.filename));
    } catch (e: any) {
      failures.push(`${row.id} (read): ${e?.message || "unknown error"}`);
      continue;
    }
    const path = `shared/${user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" });
    if (uploadError) {
      failures.push(`${row.id} (upload): ${uploadError.message}`);
      continue;
    }
    const { data: oldPath, error } = await supabase.rpc("admin_set_library_file", { p_document: doc.id, p_path: path });
    if (error) {
      failures.push(`${row.id}: ${error.message}`);
      await supabase.storage.from("documents").remove([path]);
      continue;
    }
    if (oldPath) await supabase.storage.from("documents").remove([String(oldPath)]);
    updated++;
  }

  revalidatePath("/dashboard/admin/library");
  revalidatePath("/dashboard/documents");
  if (failures.length) libraryError(`Updated ${updated}. Couldn't update: ${failures.join("; ")}`);
  redirect(`/dashboard/admin/library?refreshed=${updated}&current=${current}`);
}
