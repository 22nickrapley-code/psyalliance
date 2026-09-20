"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// (no client-side handling) crashes the whole page with Next.js's generic
// "Something went wrong / Server Components render" screen instead of
// showing anything useful - this is the same failure Nick hit on Messages
// (see startConversation) and then again here on the NPI pre-check form.
// Every validation/DB-error path in this file routes through this instead,
// so a bad input or a failed insert sends the user back to this same page
// with a friendly inline banner rather than taking the page down.
function credentialsError(message: string): never {
  redirect(`/dashboard/credentials?error=${encodeURIComponent(message)}`);
}

export async function addLicense(formData: FormData) {
  const supabase = await createClient();
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
  if (error) credentialsError(error.message);

  revalidatePath("/dashboard/credentials");
}

export async function deleteLicense(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("licenses").delete().eq("id", id);
  if (error) credentialsError(error.message);
  revalidatePath("/dashboard/credentials");
}

export async function addCeCredit(formData: FormData) {
  const supabase = await createClient();
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
  if (error) credentialsError(error.message);

  revalidatePath("/dashboard/credentials");
}

export async function deleteCeCredit(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("continuing_education_credits").delete().eq("id", id);
  if (error) credentialsError(error.message);
  revalidatePath("/dashboard/credentials");
}

export async function addInsurancePanel(formData: FormData) {
  const supabase = await createClient();
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
  if (error) credentialsError(error.message);

  revalidatePath("/dashboard/credentials");
}

export async function updateInsurancePanelStatus(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") || "");

  const { error } = await supabase.from("insurance_panels").update({ status }).eq("id", id);
  if (error) credentialsError(error.message);

  revalidatePath("/dashboard/credentials");
}

export async function deleteInsurancePanel(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const { error } = await supabase.from("insurance_panels").delete().eq("id", id);
  if (error) credentialsError(error.message);
  revalidatePath("/dashboard/credentials");
}

export async function saveNpiNumber(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const npiNumber = String(formData.get("npi_number") || "").replace(/\D/g, "");
  if (npiNumber && npiNumber.length !== 10) credentialsError("An NPI number is 10 digits");

  const { error } = await supabase
    .from("profiles")
    .update({ npi_number: npiNumber || null })
    .eq("id", user.id);
  if (error) credentialsError(error.message);

  revalidatePath("/dashboard/credentials");
  redirect("/dashboard/credentials?saved=1");
}

export async function saveCaqhInfo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const caqhProviderId = String(formData.get("caqh_provider_id") || "").trim();
  const lastAttestedDate = String(formData.get("caqh_last_attested_date") || "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({
      caqh_provider_id: caqhProviderId || null,
      caqh_last_attested_date: lastAttestedDate || null,
    })
    .eq("id", user.id);
  if (error) credentialsError(error.message);

  revalidatePath("/dashboard/credentials");
  redirect("/dashboard/credentials?saved=1");
}

// Automated pre-check against the free, public NPPES NPI Registry - feeds
// the existing human-reviewed credential_verifications queue rather than
// auto-verifying anyone. A human (Nick/Rena) still makes the final call.
export async function checkNpiRegistry() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("npi_number, full_name, states_qualified")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.npi_number) credentialsError("Add your NPI number first");

  let raw: any = null;
  let fetchError: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(profile.npi_number)}&version=2.1`,
        { cache: "no-store", signal: controller.signal }
      );
      if (!res.ok) {
        fetchError = `NPI registry returned HTTP ${res.status}`;
      } else {
        raw = await res.json();
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (e: any) {
    fetchError = e?.name === "AbortError" ? "The NPI registry took too long to respond - try again shortly" : e?.message || "Could not reach the NPI registry";
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
  if (error) credentialsError(error.message);

  revalidatePath("/dashboard/credentials");
  revalidatePath("/dashboard/profile");
}
