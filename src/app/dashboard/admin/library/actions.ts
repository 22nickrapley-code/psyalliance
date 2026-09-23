"use server";

import { createClient } from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setDocumentGovernance, submitDocumentReview, publishDocument, type ReviewerRole } from "@/lib/library-governance";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Addendum A6's Practice Library governance workflow (required reviewer
// roles -> per-role approval -> publish, enforced by the database trigger
// enforce_document_publish_requirements()) had a full service layer since
// Phase 4 batch 5 with no UI calling any of it. This is that UI's actions -
// thin wrappers, same shape as every other admin actions file.
//
// Kept admin-only for this first pass even though the RLS on
// document_reviews itself allows any signed-in member to record a review
// under their own profile_id (Addendum A6 leaves the exact reviewer
// taxonomy/permissioning to be settled operationally, not architecturally).
// Opening review submission to non-admin members with the right role is a
// natural next step, not done here.

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

export async function submitDocumentReviewAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  const documentVersion = Number(formData.get("document_version"));
  const reviewerRole = String(formData.get("reviewer_role") || "") as ReviewerRole;
  const approved = String(formData.get("approved") || "") === "true";
  const notes = String(formData.get("notes") || "") || undefined;
  if (!reviewerRole) libraryError("Choose which role this review is for");

  const { error } = await submitDocumentReview(supabase, user.id, documentId, documentVersion, reviewerRole, approved, notes);
  if (error) libraryError(error);

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

export async function unpublishDocumentAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const documentId = Number(formData.get("document_id"));
  // Sends it back to needs_review rather than draft - "was published, now
  // pulled back for a reason" is a different state from "never reviewed",
  // and the trigger only blocks the draft/needs_review -> published edge,
  // not this one.
  const { error } = await supabase.from("documents").update({ review_status: "needs_review" }).eq("id", documentId);
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

  // Idempotent: a document from a previous run is titled "PA-XX: ...", so a
  // re-click (or a partial prior run) doesn't create duplicates.
  const { data: existing } = await supabase
    .from("documents")
    .select("title")
    .eq("owner_scope", "world")
    .like("title", "PA-__: %");
  const existingIds = new Set((existing || []).map((d) => d.title.slice(0, 5)));

  let seeded = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const row of manifestRows) {
    const { id, filename, title, category, audience } = row;
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
      title: `${id}: ${title}`,
      storage_path: storagePath,
      uploaded_by: user.id,
      is_general: true,
      resource_owner_id: user.id,
      version: 1,
      sources: "PsyAlliance Shared Library Starter Set (provided by Nick Rapley, Sept 2026)",
      applicability: `${audience} - ${category}`,
      customization_warning:
        "Template - review and adapt to your state's requirements, your practice's actual policies, and current law before use. Not a substitute for your own legal/compliance review.",
      review_status: "needs_review",
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
