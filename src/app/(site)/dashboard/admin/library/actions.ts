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

// The current template files: the starter set as committed in 2a29e3c
// (no PA numbers; "In review" printed on every page), each checked against its SHA-256 so
// nothing else can be swapped in. Read from disk when running locally,
// otherwise fetched from that exact commit on GitHub.
const FILES_COMMIT = "2a29e3c7da6867d01d16f61f6f65d15d0d011895";
const FILES_BASE = `https://raw.githubusercontent.com/22nickrapley-code/psyalliance/${FILES_COMMIT}/seed-data/PsyAlliance-Shared-Library-Starter-Set/`;
// Every file in this set is printed as version 1.0.
const FILES_VERSION = 1;
const LIBRARY_FILES: Record<string, { file: string; sha256: string }> = {
  "PA-01": { file: "Reciprocal-Coverage-Agreement.pdf", sha256: "ef0042f35f9dc1de452127c594d25e77f8739c38a0145879b3c6422dd98ec18f" },
  "PA-02": { file: "Extended-Leave-Coverage-and-Handoff-Pack.pdf", sha256: "f188e7497e10ba33bc94b4896b16c2981af0eb91f0e39d8b3b4fae2a5ba5af7d" },
  "PA-03": { file: "Professional-Will-and-Succession-Plan.pdf", sha256: "029fa8ed99999179063c66d64c7a6cea72957bcbf43bcfdb7c3f630812af25ab" },
  "PA-04": { file: "Peer-Consultation-Group-Charter.pdf", sha256: "117af1a8eaa9581167e8bc32a9d84bd3789dc5a115d01fa699b82aa086c86d07" },
  "PA-05": { file: "Case-Consultation-Presentation-Template.pdf", sha256: "cd2e9a994ac872ad51c0010be61b853f266883b77b9f731804017f2f24145825" },
  "PA-06": { file: "Clinical-Supervision-Agreement-and-Log.pdf", sha256: "00e407b776d2f8e7f4248cd682c9a8755caec7c26d703bed5bb8dde15e0a5640" },
  "PA-07": { file: "Referral-Termination-and-Transfer-of-Care-Toolkit.pdf", sha256: "e14284971e79b12551bb10fc1b543bd6d1c72e994a2d6ca92a0589bede8b56c4" },
  "PA-08": { file: "Split-Treatment-Collaboration-Agreement.pdf", sha256: "1a0ae59e8ad6d89d850da9219d118a3a677992f545dfcf58e354158c2d25a71f" },
  "PA-09": { file: "Informed-Consent-for-Psychotherapy.pdf", sha256: "64026a2e7716faeb64150c01ab0bd9ce3b6adc2219de1f3a6252d0a19c46ef0f" },
  "PA-10": { file: "Telepsychology-Consent-and-Multi-State-Checklist.pdf", sha256: "700196a779fa87a2e0da171a88dd1915fdbf02bb09c3147c1893217a3c91bea3" },
  "PA-11": { file: "AI-Scribe-and-AI-Tools-Consent-Vetting-and-Policy.pdf", sha256: "6aeba075710e4a5ee2079693eb7e85cbb9d0774e55a078eb177bef0f4678bce2" },
  "PA-12": { file: "Clinical-Documentation-Pack.pdf", sha256: "849fcf9de302cd7751f5eb59a852c061c2fa3029621e675b35e85fe02e39fd1b" },
  "PA-13": { file: "Suicide-Risk-Safety-Planning-and-Follow-Up-Pack.pdf", sha256: "a5bd81eb68a16e9d0925c8f57a3efe406ed9fbb18afd526bafc9ab2258d2d568" },
  "PA-14": { file: "Telepsychiatry-and-Controlled-Substance-Compliance-Kit.pdf", sha256: "7702a66f3353f2133673d5a18751b2c483235f827bbf8219b9a1e1b3754d9639" },
  "PA-15": { file: "Financial-Policy-Good-Faith-Estimate-and-Superbill-Pack.pdf", sha256: "2422af9bd1c39fcc6fd21520f8d5a244159f3045b1b9284e4eb63fec7baf7472" },
  "PA-16": { file: "Group-Practice-Clinician-Agreement-Builder.pdf", sha256: "c4d1a771c2b3a1c0c1261c6d856f43faff86b04b2adf5147333d2361fac6d453" },
  "PA-17": { file: "Privacy-Notice-and-Release-of-Information-Pack.pdf", sha256: "19c01435ba167fd4e8e568e5860a7b856a32be69d654abda1d64692acc5c2c59" },
  "PA-18": { file: "HIPAA-Security-Risk-Analysis-and-Breach-Response-Kit.pdf", sha256: "4015cf2bc9b0f7d28504492891a465dc2eefd67417249b157104fbaef76b3fba" },
  "PA-19": { file: "Practice-Compliance-Calendar-and-Renewal-Tracker.pdf", sha256: "69e3f662e7105946e5da9c3bdd1b477e7ee46327d1353b9fe2547bffd85b881b" },
  "PA-20": { file: "Subpoena-Court-Order-and-Records-Request-Response-Guide.pdf", sha256: "5a068021286dd29f81faf5d55d310616d88d36ee34e884b27fd1102377e6dd09" },
};

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function readLibraryFile(file: string): Promise<Uint8Array<ArrayBuffer>> {
  const local = join(STARTER_LIBRARY_DIR, file);
  if (existsSync(local)) return new Uint8Array(readFileSync(local)) as Uint8Array<ArrayBuffer>;
  const res = await fetch(FILES_BASE + encodeURIComponent(file), { cache: "no-store" });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// Replace each template's file with the current one: upload it, point the
// template at it (version as printed in the file, title without its PA
// number) and remove the old file. Members' working copies are
// untouched. Works on the deployed site and locally; run once per site.
export async function refreshLibraryFilesAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertIsAdmin(supabase, user.id);

  const { data: docs } = await supabase
    .from("documents")
    .select("id, library_code, storage_path")
    .eq("owner_scope", "world")
    .not("library_code", "is", null);

  let updated = 0;
  let current = 0;
  const failures: string[] = [];
  for (const doc of (docs || []) as any[]) {
    const entry = LIBRARY_FILES[doc.library_code];
    if (!entry) continue;
    const tag = entry.sha256.slice(0, 10);
    if (String(doc.storage_path).endsWith(`-${tag}-${entry.file}`)) {
      current++;
      continue;
    }
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await readLibraryFile(entry.file);
      if ((await sha256Hex(bytes)) !== entry.sha256) throw new Error("file doesn't match the expected version");
    } catch (e: any) {
      failures.push(`${doc.library_code}: ${e?.message || "couldn't read the file"}`);
      continue;
    }
    const path = `shared/${user.id}/${Date.now()}-${tag}-${entry.file}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" });
    if (uploadError) {
      failures.push(`${doc.library_code} (upload): ${uploadError.message}`);
      continue;
    }
    // The template's version follows the version printed in the file.
    const { data: oldPath, error } = await supabase.rpc("admin_set_library_file", { p_document: doc.id, p_path: path, p_version: FILES_VERSION });
    if (error) {
      failures.push(`${doc.library_code}: ${error.message}`);
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
