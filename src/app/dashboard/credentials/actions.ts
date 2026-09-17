"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addLicense(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("licenses").insert({
    profile_id: user.id,
    state: String(formData.get("state") || "").toUpperCase(),
    license_number: String(formData.get("license_number") || ""),
    license_type: String(formData.get("license_type") || "") || null,
    issued_date: String(formData.get("issued_date") || "") || null,
    expiration_date: String(formData.get("expiration_date") || "") || null,
    notes: String(formData.get("notes") || "") || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/credentials");
}

export async function deleteLicense(formData: FormData) {
  const supabase = createClient();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("licenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/credentials");
}

export async function addCeCredit(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("continuing_education_credits").insert({
    profile_id: user.id,
    title: String(formData.get("title") || ""),
    provider: String(formData.get("provider") || "") || null,
    category: String(formData.get("category") || "") || null,
    hours: parseFloat(String(formData.get("hours") || "0")) || 0,
    completed_date: String(formData.get("completed_date") || ""),
    license_id: formData.get("license_id") ? Number(formData.get("license_id")) : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/credentials");
}

export async function deleteCeCredit(formData: FormData) {
  const supabase = createClient();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("continuing_education_credits").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/credentials");
}

export async function addInsurancePanel(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("insurance_panels").insert({
    profile_id: user.id,
    insurance_name: String(formData.get("insurance_name") || ""),
    status: String(formData.get("status") || "pending"),
    effective_date: String(formData.get("effective_date") || "") || null,
    renewal_date: String(formData.get("renewal_date") || "") || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/credentials");
}

export async function updateInsurancePanelStatus(formData: FormData) {
  const supabase = createClient();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") || "");

  const { error } = await supabase.from("insurance_panels").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/credentials");
}

export async function deleteInsurancePanel(formData: FormData) {
  const supabase = createClient();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("insurance_panels").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/credentials");
}

export async function saveNpiNumber(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const npiNumber = String(formData.get("npi_number") || "").replace(/\D/g, "");
  if (npiNumber && npiNumber.length !== 10) throw new Error("An NPI number is 10 digits");

  const { error } = await supabase
    .from("profiles")
    .update({ npi_number: npiNumber || null })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/credentials");
}

// Automated pre-check against the free, public NPPES NPI Registry - feeds
// the existing human-reviewed credential_verifications queue rather than
// auto-verifying anyone. A human (Nick/Rena) still makes the final call.
export async function checkNpiRegistry() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("npi_number, full_name, states_qualified")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.npi_number) throw new Error("Add your NPI number first");

  let raw: any = null;
  let fetchError: string | null = null;
  try {
    const res = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(profile.npi_number)}&version=2.1`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      fetchError = `NPI registry returned HTTP ${res.status}`;
    } else {
      raw = await res.json();
    }
  } catch (e: any) {
    fetchError = e?.message || "Could not reach the NPI registry";
  }

  let matched = false;
  let flaggedReason: string | null = fetchError;

  if (raw && raw.result_count > 0) {
    const result = raw.results[0];
    const registryName = `${result.basic?.first_name || ""} ${result.basic?.last_name || ""}`.toLowerCase();
    const lastName = (result.basic?.last_name || "").toLowerCase();
    const ourName = (profile.full_name || "").toLowerCase();
    const nameLooksRight = lastName.length > 0 && ourName.includes(lastName);

    const registryStates = new Set<string>([
      ...(result.addresses || []).map((a: any) => a.state),
      ...(result.taxonomies || []).map((t: any) => t.state),
    ]);
    const stateLooksRight = (profile.states_qualified || []).some((s: string) => registryStates.has(s));

    matched = nameLooksRight && stateLooksRight;
    if (!matched) {
      flaggedReason = `NPI record found (${registryName || "unknown name"}) but name/state didn't clearly match your profile - needs human review`;
    }
  } else if (!fetchError) {
    flaggedReason = "No record found in the NPI registry for that number";
  }

  const { error } = await supabase.from("credential_verifications").insert({
    profile_id: user.id,
    source: "npi_registry",
    license_number: profile.npi_number,
    raw_result: raw,
    matched,
    flagged_reason: matched ? null : flaggedReason,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/credentials");
  revalidatePath("/dashboard/profile");
}
