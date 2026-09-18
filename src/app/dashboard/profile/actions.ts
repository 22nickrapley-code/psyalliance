"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractStructuredData, AiNotConfiguredError } from "@/lib/ai/anthropic";

// Categories the AI import is allowed to auto-check from a pasted bio. The
// self-disclosure categories (ethnicity, gender identity, sex) are
// deliberately excluded even though they're plain lookup_values too - those
// are a personal disclosure the practitioner opts into themselves, not
// something to guess at from third-party bio text.
const AI_MATCHABLE_CATEGORIES = [
  "treatment_specialism",
  "treatment_modality",
  "insurance",
  "language",
  "session_type",
  "age_group_specialism",
  "sexual_orientation_specialism",
];

const RANKED_CATEGORIES = ["treatment_specialism", "treatment_modality"];
const SINGLE_SELECT_CATEGORIES = ["sex"];

export async function saveProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const statesRaw = String(formData.get("states_qualified") || "");
  const statesQualified = statesRaw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const profileRow = {
    id: user.id,
    full_name: String(formData.get("full_name") || ""),
    credential_prefix: String(formData.get("credential_prefix") || "") || null,
    qualification_level: String(formData.get("qualification_level") || "PhD"),
    board_certified: formData.get("board_certified") === "on",
    primary_practice_city: String(formData.get("primary_practice_city") || "") || null,
    states_qualified: statesQualified,
    primary_state: statesQualified[0] || null,
    accepting_referrals: formData.get("accepting_referrals") === "on",
    pronoun: String(formData.get("pronoun") || "") || null,
    practice_website: String(formData.get("practice_website") || "") || null,
    contact_phone: String(formData.get("contact_phone") || "") || null,
    contact_email: String(formData.get("contact_email") || "") || null,
    open_to_group_consultation: formData.get("open_to_group_consultation") === "on",
    open_to_give_supervision: formData.get("open_to_give_supervision") === "on",
    open_to_receive_supervision: formData.get("open_to_receive_supervision") === "on",
    psypact_participating: formData.get("psypact_participating") === "on",
    runs_private_practice: formData.get("runs_private_practice") === "on",
    employed_by_group_practice: formData.get("employed_by_group_practice") === "on",
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase.from("profiles").upsert(profileRow);
  if (upsertError) {
    throw new Error(upsertError.message);
  }

  // Rebuild the profile's lookup-value associations from scratch each save -
  // simplest correct approach for a form with a variable number of checkboxes.
  const { data: allLookups } = await supabase.from("lookup_values").select("id, category");

  const rows: { profile_id: string; lookup_value_id: number; rank: number | null }[] = [];
  const singleSelectIdsChosen = new Set<string>();
  for (const category of SINGLE_SELECT_CATEGORIES) {
    const chosen = formData.get(`single_${category}`);
    if (chosen) singleSelectIdsChosen.add(String(chosen));
  }
  for (const lv of allLookups || []) {
    if (SINGLE_SELECT_CATEGORIES.includes(lv.category)) {
      if (singleSelectIdsChosen.has(String(lv.id))) {
        rows.push({ profile_id: user.id, lookup_value_id: lv.id, rank: null });
      }
      continue;
    }
    const checked = formData.get(`lv_${lv.id}`) === "on";
    if (!checked) continue;
    let rank: number | null = null;
    if (RANKED_CATEGORIES.includes(lv.category)) {
      const rankRaw = formData.get(`rank_${lv.id}`);
      rank = rankRaw ? parseInt(String(rankRaw), 10) || null : null;
    }
    rows.push({ profile_id: user.id, lookup_value_id: lv.id, rank });
  }

  await supabase.from("profile_lookup_values").delete().eq("profile_id", user.id);
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("profile_lookup_values").insert(rows);
    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  redirect("/dashboard/profile?saved=1");
}

export async function saveAvailability(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const days = formData.getAll("availability_day").map((d) => Number(d));

  await supabase.from("profile_availability").delete().eq("profile_id", user.id);
  if (days.length > 0) {
    const { error } = await supabase
      .from("profile_availability")
      .insert(days.map((day_of_week) => ({ profile_id: user.id, day_of_week })));
    if (error) throw new Error(error.message);
  }

  revalidatePath("/dashboard/profile");
}

// Turns a pasted bio (from Psychology Today, a practice website, LinkedIn,
// anywhere) into pre-fill values for the profile form above. Returns data
// for the client component to apply to the DOM itself - this never writes
// to the database; the user still reviews everything and clicks "Save
// profile" themselves.
export async function parseProfileBio(bioText: string): Promise<{
  fields?: {
    full_name: string | null;
    credential_prefix: string | null;
    qualification_level: string | null;
    primary_practice_city: string | null;
    states_qualified: string[];
    pronoun: string | null;
    practice_website: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  };
  matchedLookupIds?: number[];
  matchedLabels?: string[];
  error?: string;
}> {
  const trimmed = bioText.trim();
  if (!trimmed) return { error: "Paste some bio text first." };
  if (trimmed.length > 20000) return { error: "That's a lot of text - trim it to the essentials (under ~20,000 characters) and try again." };

  const supabase = await createClient();
  const { data: lookups } = await supabase
    .from("lookup_values")
    .select("category, value")
    .in("category", AI_MATCHABLE_CATEGORIES);

  const byCategory: Record<string, string[]> = {};
  for (const lv of lookups || []) {
    byCategory[lv.category] = byCategory[lv.category] || [];
    byCategory[lv.category].push(lv.value);
  }
  const optionsBlock = Object.entries(byCategory)
    .map(([category, values]) => `${category}: ${values.join(", ")}`)
    .join("\n");

  try {
    const result = await extractStructuredData<{
      full_name?: string;
      credential_prefix?: string;
      qualification_level?: string;
      primary_practice_city?: string;
      states_qualified?: string[];
      pronoun?: string;
      practice_website?: string;
      contact_phone?: string;
      contact_email?: string;
      matched_options?: { category: string; value: string }[];
    }>({
      system:
        "You extract structured profile data for a psychologist/psychiatrist practice directory from bio text the practitioner pasted themselves (their own Psychology Today profile, practice website, LinkedIn, CV, etc). Only extract what's actually stated - never invent or guess a value. For matched_options, choose ONLY from the exact category/value pairs given in the allowed options list; do not invent new values, and skip anything not clearly supported by the text.",
      userContent: `Bio text:\n"""\n${trimmed}\n"""\n\nAllowed options (category: comma-separated canonical values - only match from these):\n${optionsBlock}`,
      toolName: "extract_profile",
      toolDescription: "Extract structured profile fields and matching specialism/preference options from bio text.",
      inputSchema: {
        type: "object",
        properties: {
          full_name: { type: "string", description: "Full name, if stated" },
          credential_prefix: { type: "string", description: "e.g. Dr" },
          qualification_level: { type: "string", enum: ["PhD", "PsyD", "EdD", "MD"] },
          primary_practice_city: { type: "string" },
          states_qualified: { type: "array", items: { type: "string" }, description: "Two-letter US state codes the practitioner is licensed in" },
          pronoun: { type: "string" },
          practice_website: { type: "string" },
          contact_phone: { type: "string" },
          contact_email: { type: "string" },
          matched_options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                value: { type: "string" },
              },
              required: ["category", "value"],
            },
          },
        },
      },
    });

    const { data: allLookups } = await supabase
      .from("lookup_values")
      .select("id, category, value")
      .in("category", AI_MATCHABLE_CATEGORIES);
    const idByCategoryValue = new Map((allLookups || []).map((lv) => [`${lv.category}::${lv.value}`, lv.id]));

    const matchedLookupIds: number[] = [];
    const matchedLabels: string[] = [];
    for (const m of result.matched_options || []) {
      const id = idByCategoryValue.get(`${m.category}::${m.value}`);
      if (id) {
        matchedLookupIds.push(id);
        matchedLabels.push(m.value);
      }
    }

    return {
      fields: {
        full_name: result.full_name || null,
        credential_prefix: result.credential_prefix || null,
        qualification_level: result.qualification_level || null,
        primary_practice_city: result.primary_practice_city || null,
        states_qualified: (result.states_qualified || []).map((s) => s.toUpperCase()),
        pronoun: result.pronoun || null,
        practice_website: result.practice_website || null,
        contact_phone: result.contact_phone || null,
        contact_email: result.contact_email || null,
      },
      matchedLookupIds,
      matchedLabels,
    };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Something went wrong parsing that text." };
  }
}

export async function submitCredentialVerification(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("credential_verifications").insert({
    profile_id: user.id,
    source: String(formData.get("source") || "state_board"),
    state: String(formData.get("state") || "") || null,
    license_number: String(formData.get("license_number") || ""),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/profile");
}
