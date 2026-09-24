"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractStructuredData, AiNotConfiguredError } from "@/lib/ai/anthropic";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function profileError(message: string): never {
  redirect(`/dashboard/profile?error=${encodeURIComponent(message)}`);
}

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

  // Practice state comes from a US state picker now. Licensed states live
  // in Credentials (reviewed licences); states_qualified is kept only as a
  // legacy mirror so older read paths still see the practice state.
  const primaryState = String(formData.get("primary_state") || "").trim().toUpperCase() || null;
  const { data: existing } = await supabase.from("profiles").select("states_qualified").eq("id", user.id).maybeSingle();
  const prevStates: string[] = existing?.states_qualified || [];
  const statesQualified = primaryState ? [primaryState, ...prevStates.filter((s) => s !== primaryState)] : prevStates;
  const bio = String(formData.get("bio") || "").trim().slice(0, 700);

  const profileRow = {
    id: user.id,
    full_name: String(formData.get("full_name") || "").trim(),
    credential_prefix: String(formData.get("credential_prefix") || "").trim() || null,
    qualification_level: String(formData.get("qualification_level") || "PhD"),
    board_certified: formData.get("board_certified") === "on",
    primary_practice_city: String(formData.get("primary_practice_city") || "").trim() || null,
    states_qualified: statesQualified,
    primary_state: primaryState,
    bio: bio || null,
    // accepting_referrals is deliberately NOT written here (Sept 23 audit
    // fix): it's a derived mirror of the confirmed Availability status.
    pronoun: String(formData.get("pronoun") || "") || null,
    practice_website: String(formData.get("practice_website") || "") || null,
    contact_phone: String(formData.get("contact_phone") || "") || null,
    contact_email: String(formData.get("contact_email") || "") || null,
    open_to_group_consultation: formData.get("open_to_group_consultation") === "on",
    open_to_give_supervision: formData.get("open_to_give_supervision") === "on",
    open_to_receive_supervision: formData.get("open_to_receive_supervision") === "on",
    psypact_participating: formData.get("psypact_participating") === "on",
    updated_at: new Date().toISOString(),
  };
  if (!profileRow.full_name) profileError("Add your full name");

  const { error: upsertError } = await supabase.from("profiles").upsert(profileRow);
  if (upsertError) {
    profileError(upsertError.message);
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
  // "Your top five" specialties: spec_rank_1..5 selects. A specialty
  // picked there is saved with that rank whether or not its checkbox is
  // ticked; ticked-only specialties are saved unranked.
  const topRank = new Map<number, number>();
  for (let n = 1; n <= 5; n++) {
    const id = Number(formData.get(`spec_rank_${n}`));
    if (Number.isFinite(id) && id > 0 && !topRank.has(id)) topRank.set(id, n);
  }
  const usesTopFive = formData.has("spec_rank_1");
  for (const lv of allLookups || []) {
    if (usesTopFive && lv.category === "treatment_specialism") {
      const checked = formData.get(`lv_${lv.id}`) === "on";
      const r = topRank.get(lv.id);
      if (r || checked) rows.push({ profile_id: user.id, lookup_value_id: lv.id, rank: r ?? null });
      continue;
    }
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
      profileError(insertError.message);
    }
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  redirect("/dashboard/profile?saved=1");
}

// The three "Open to" flags shown on the profile view, keyed to their exact
// profiles column name so the toggle below can update any of them with one
// shared function instead of three near-identical ones. Incoming referrals
// used to be a fourth one-click field here (accepting_referrals) - removed
// Sept 23 as part of the audit fix, since that field is now derived from the
// confirmed Availability tri-state, not independently toggleable. It's shown
// read-only on the profile view with a link to Availability instead.
const OPEN_TO_FIELDS = new Set([
  "open_to_give_supervision",
  "open_to_receive_supervision",
  "open_to_group_consultation",
]);

// One-click "Open to" toggle from the read-only profile view - per Nick's
// note, these should flip with a single click right there, not require
// the full Edit Profile flow just to change a yes/no. Takes the field name
// and its current value (so it can flip it) via hidden form inputs.
export async function toggleOpenToField(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const field = String(formData.get("field") || "");
  if (!OPEN_TO_FIELDS.has(field)) profileError("Unknown toggle field.");

  const current = formData.get("current") === "true";
  const { error } = await supabase
    .from("profiles")
    .update({ [field]: !current, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) profileError(error.message);

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/people/${user.id}`);
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
    if (error) profileError(error.message);
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
          qualification_level: { type: "string", enum: ["PhD", "PsyD", "EdD", "MD", "DO"] },
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

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Professional photo upload, in the vein of a Psychology Today profile
// photo. Stored privately (see 0032_profile_avatar_upload.sql) - only ever
// shown to another signed-in member via a short-lived signed URL, never a
// public one.
export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent("Choose a photo first."));
  }
  const photo = file as File;
  if (!ALLOWED_AVATAR_TYPES.has(photo.type)) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent("Please upload a JPEG, PNG, or WebP image."));
  }
  if (photo.size > MAX_AVATAR_BYTES) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent("That photo is too large - please keep it under 5MB."));
  }

  // A profile row must already exist (created by the main "Save profile"
  // form) since avatar_path lives on it and profiles.full_name etc are
  // NOT NULL with no default - there's nothing sensible to upsert here.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();
  if (!existingProfile) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent("Save your profile details below first, then add a photo."));
  }

  const ext = (photo.name.split(".").pop() || photo.type.split("/")[1] || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, photo, {
    contentType: photo.type,
    upsert: false,
  });
  if (uploadError) {
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent(uploadError.message));
  }

  const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (updateError) {
    // Clean up the just-uploaded object rather than leaving an orphan.
    await supabase.storage.from("avatars").remove([path]);
    redirect("/dashboard/profile?avatar_error=" + encodeURIComponent(updateError.message));
  }

  // Best-effort cleanup of the previous photo, if any - not awaited-critical,
  // and never blocks the redirect below on failure.
  const oldPath = existingProfile?.avatar_path;
  if (oldPath && oldPath !== path) {
    await supabase.storage.from("avatars").remove([oldPath]);
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  redirect("/dashboard/profile?avatar_saved=1");
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
  if (error) profileError(error.message);

  revalidatePath("/dashboard/profile");
}
