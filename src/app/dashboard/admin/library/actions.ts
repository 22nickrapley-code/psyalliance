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

// The current template files: the starter set as committed in 54d55af
// (PA numbers taken out of the PDFs), each checked against its SHA-256 so
// nothing else can be swapped in. Read from disk when running locally,
// otherwise fetched from that exact commit on GitHub.
const FILES_COMMIT = "54d55af24d8758a7863b94c6462062e474ad5048";
const FILES_BASE = `https://raw.githubusercontent.com/22nickrapley-code/psyalliance/${FILES_COMMIT}/seed-data/PsyAlliance-Shared-Library-Starter-Set/`;
const LIBRARY_FILES: Record<string, { file: string; sha256: string }> = {
  "PA-01": { file: "Reciprocal-Coverage-Agreement.pdf", sha256: "51067b4147e33b51410be14a8a9d167f99dbb12b244c1f69de818fcec4690a6b" },
  "PA-02": { file: "Extended-Leave-Coverage-and-Handoff-Pack.pdf", sha256: "45302b03c18b8d0f49f80779c6b869b17457fc83d4ceb69d5707f133b6dd697e" },
  "PA-03": { file: "Professional-Will-and-Succession-Plan.pdf", sha256: "b80d9495a9ddb0a50c902d53c7116a6f09bafebe630ca1a273b0e87ddf36ef75" },
  "PA-04": { file: "Peer-Consultation-Group-Charter.pdf", sha256: "8dba348e5c8bb8ea2bb9249f0dcb94cec570939e7945c4de601a58c9c008e9ab" },
  "PA-05": { file: "Case-Consultation-Presentation-Template.pdf", sha256: "fbaeed8b694fc17270256b144ac9d35f0222d3e102cc2459f580d2283c6da44f" },
  "PA-06": { file: "Clinical-Supervision-Agreement-and-Log.pdf", sha256: "62c734f1da50527e1476657cf157d57a3eb919f76ff00c01f5e04d85f771e099" },
  "PA-07": { file: "Referral-Termination-and-Transfer-of-Care-Toolkit.pdf", sha256: "64a4251dc5494300e035e8e366ed9381dad22fa1f2fd083484d9d6e48a671b34" },
  "PA-08": { file: "Split-Treatment-Collaboration-Agreement.pdf", sha256: "51caa1642f45c6d27d53d42521052952b7ef07d86de4319906d9f661ab960238" },
  "PA-09": { file: "Informed-Consent-for-Psychotherapy.pdf", sha256: "b20d337cf92c781f55af8e34221a50b76de98170949242259d15b8b8578914ec" },
  "PA-10": { file: "Telepsychology-Consent-and-Multi-State-Checklist.pdf", sha256: "9933bf06a7d4f849e6a73ae4d0dfd55a3d51f0ecd592abb0e92c27e1322f86bb" },
  "PA-11": { file: "AI-Scribe-and-AI-Tools-Consent-Vetting-and-Policy.pdf", sha256: "5dbbadebc527a27f00d3e960d2caecfe1a2a3da0ab177886b8c7c9ee19b0af08" },
  "PA-12": { file: "Clinical-Documentation-Pack.pdf", sha256: "5b40c73ef416c3deffce4eae8912b90e1d67a6cadf2ca134eef9b978aac648cb" },
  "PA-13": { file: "Suicide-Risk-Safety-Planning-and-Follow-Up-Pack.pdf", sha256: "7360b72a9ab8bffdb3aea74f3535b63b8c77dd54cbcf763dfc80166d122d1b02" },
  "PA-14": { file: "Telepsychiatry-and-Controlled-Substance-Compliance-Kit.pdf", sha256: "7e79558476d9fec03b5cda1d26b455b9ac83568853bc75bdca142a62c8ee8198" },
  "PA-15": { file: "Financial-Policy-Good-Faith-Estimate-and-Superbill-Pack.pdf", sha256: "fa845c493b88d4bbd816ec820fb1e3c31712f99d05d32f477cae9c7c232e6982" },
  "PA-16": { file: "Group-Practice-Clinician-Agreement-Builder.pdf", sha256: "be38f718cab06abdf1740c35ae014c672103936c5496bfc3e8d320c743a5c8f1" },
  "PA-17": { file: "Privacy-Notice-and-Release-of-Information-Pack.pdf", sha256: "a52db0dea8000b9a54d645dccc681804fe29e7a15198eab6ae37654368f90c06" },
  "PA-18": { file: "HIPAA-Security-Risk-Analysis-and-Breach-Response-Kit.pdf", sha256: "e418446f65a2a754ec3ba5a96fd0e43280839328567819931b6f9c4451a19e57" },
  "PA-19": { file: "Practice-Compliance-Calendar-and-Renewal-Tracker.pdf", sha256: "f77df1294d6cb2c8eebb79d6416be07d5b0381a87821f8beccc40bbf65f08935" },
  "PA-20": { file: "Subpoena-Court-Order-and-Records-Request-Response-Guide.pdf", sha256: "43b9f2a939614335ca226ae2bceb8f4f497d17f18c12df81c0d38133c5927fc5" },
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

// Replace each template's file with the current one: upload under the new
// file name, point the template at it (one new version, title without its
// PA number) and remove the old file. Members' working copies are
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
    if (String(doc.storage_path).endsWith(`-${entry.file}`)) {
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
    const path = `shared/${user.id}/${Date.now()}-${entry.file}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" });
    if (uploadError) {
      failures.push(`${doc.library_code} (upload): ${uploadError.message}`);
      continue;
    }
    const { data: oldPath, error } = await supabase.rpc("admin_set_library_file", { p_document: doc.id, p_path: path });
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
