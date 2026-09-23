// One-off seeding script for PsyAlliance's governed Practice Library
// (task #120, Sept 23 audit remediation).
//
// SUPERSEDED by the "Seed starter library" button on
// /dashboard/admin/library (src/app/dashboard/admin/library/actions.ts,
// seedStarterLibraryAction) - that version reuses the same
// authenticated-upload path the regular Documents page already uses, so it
// needs no service-role key at all, just an admin clicking a button while
// signed in via `npm run dev`. Use that instead; this script is kept only
// as a documented CLI alternative for anyone who'd rather run it that way.
//
// Reads the manifest Nick provided alongside the PA-01..20 PDFs, uploads
// each PDF to the shared/ storage folder, and inserts a `documents` row
// with Addendum A6 governance metadata (version, sources, applicability,
// required_reviewer_roles) so each one lands in the existing admin review
// queue at /dashboard/admin/library in `needs_review` - NOT auto-published.
// Nothing here marks anything published; that stays a deliberate human
// action by Nick/Rena per resource, exactly as Addendum A6 designs it.
//
// This has to run on Nick's own machine, not in the cloud build - it needs
// SUPABASE_SERVICE_ROLE_KEY (to bypass Storage RLS for a bulk upload) which
// is deliberately left blank in the checked-in .env.local and was never
// something Claude should ask for or handle; Nick fills it in locally from
// Supabase dashboard -> Project Settings -> API -> service_role secret,
// runs the script, then (optionally) blanks the key again afterward.
//
// From the repo root, with the 21 files (manifest.csv + PA-01..20 PDFs)
// placed at seed-data/PsyAlliance-Shared-Library-Starter-Set/ (already
// checked into the repo as of this commit):
//   node scripts/seed-practice-library.mjs
//
// A different location can be passed as the first argument.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Minimal .env.local parser - avoids depending on the dotenv package not
// being hoisted to top-level node_modules in this checkout.
function loadEnvLocal(path) {
  const text = readFileSync(path, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}
const env = loadEnvLocal(join(REPO_ROOT, ".env.local"));

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local - add it from the Supabase dashboard " +
      "(Project Settings -> API -> service_role secret) before running this script."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NICK_PROFILE_ID = "80f99ddc-39bd-4c82-9d7e-5965c3473613"; // Nick's real, verified profile
const ROOT =
  process.argv[2] || join(REPO_ROOT, "seed-data", "PsyAlliance-Shared-Library-Starter-Set");

// Per-document required reviewer roles, per Addendum A6's open reviewer-role
// vocabulary (clinical / legal_regulatory / privacy_security / prescribing).
// A first-pass, defensible mapping by document content - Nick/Rena should
// sanity-check role assignment during actual review, since A6 explicitly
// leaves the exact taxonomy to be settled operationally, not architecturally.
const ROLES = {
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

function parseCsv(text) {
  // Minimal CSV parser sufficient for this manifest (quoted fields with
  // embedded commas, no embedded quotes-within-quotes or newlines).
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
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

async function main() {
  const manifestText = readFileSync(`${ROOT}/manifest.csv`, "utf8");
  const rows = parseCsv(manifestText);
  console.log(`Manifest rows: ${rows.length}`);

  const results = [];
  for (const row of rows) {
    const { id, filename, title, category, audience, summary, tags } = row;
    const filePath = `${ROOT}/${filename}`;
    const bytes = readFileSync(filePath);
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `shared/${NICK_PROFILE_ID}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf" });
    if (uploadError) {
      console.error(`UPLOAD FAILED ${id}: ${uploadError.message}`);
      results.push({ id, ok: false, stage: "upload", error: uploadError.message });
      continue;
    }

    const requiredRoles = ROLES[id] || ["clinical"];
    const { data: inserted, error: insertError } = await supabase
      .from("documents")
      .insert({
        profile_id: NICK_PROFILE_ID,
        owner_scope: "world",
        title: `${id}: ${title}`,
        storage_path: storagePath,
        uploaded_by: NICK_PROFILE_ID,
        is_general: true, // practice-management/governance docs, not tied to a clinical treatment specialism
        resource_owner_id: NICK_PROFILE_ID,
        version: 1,
        sources: "PsyAlliance Shared Library Starter Set (provided by Nick Rapley, Sept 2026)",
        applicability: `${audience} - ${category}`,
        customization_warning:
          "Template - review and adapt to your state's requirements, your practice's actual policies, and current law before use. Not a substitute for your own legal/compliance review.",
        review_status: "needs_review",
        required_reviewer_roles: requiredRoles,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(`INSERT FAILED ${id}: ${insertError.message}`);
      results.push({ id, ok: false, stage: "insert", error: insertError.message });
      continue;
    }

    console.log(`OK ${id} -> document id ${inserted.id} (roles: ${requiredRoles.join(", ")})`);
    results.push({ id, ok: true, documentId: inserted.id });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nDone: ${results.length - failed.length}/${results.length} succeeded.`);
  if (failed.length > 0) {
    console.log("Failures:", JSON.stringify(failed, null, 2));
    process.exit(1);
  }
}

main();
