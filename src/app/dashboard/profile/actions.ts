"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const RANKED_CATEGORIES = ["treatment_specialism", "treatment_modality"];
const SINGLE_SELECT_CATEGORIES = ["sex"];

export async function saveProfile(formData: FormData) {
  const supabase = createClient();
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
}

export async function saveAvailability(formData: FormData) {
  const supabase = createClient();
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

export async function submitCredentialVerification(formData: FormData) {
  const supabase = createClient();
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
