"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createBookOfBusiness(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const name = String(formData.get("name") || "");
  const retentionPct = parseFloat(String(formData.get("expense_burden_pct") || "1"));

  const { error } = await supabase.from("books_of_business").insert({
    profile_id: user.id,
    name,
    expense_burden_pct: retentionPct,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}

export async function createCase(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const bookId = formData.get("book_of_business_id");

  const { error } = await supabase.from("caseload_clients").insert({
    profile_id: user.id,
    book_of_business_id: bookId ? Number(bookId) : null,
    private_label: String(formData.get("private_label") || "") || null,
    state: String(formData.get("state") || "") || null,
    city: String(formData.get("city") || "") || null,
    session_type: String(formData.get("session_type") || "") || null,
    insurance: String(formData.get("insurance") || "") || null,
    primary_need: String(formData.get("primary_need") || "") || null,
    secondary_need: String(formData.get("secondary_need") || "") || null,
    tertiary_need: String(formData.get("tertiary_need") || "") || null,
    rate_per_session: parseFloat(String(formData.get("rate_per_session") || "0")) || null,
    sessions_per_week: parseFloat(String(formData.get("sessions_per_week") || "0")) || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}

export async function archiveCase(formData: FormData) {
  const supabase = createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase
    .from("caseload_clients")
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/caseload");
  revalidatePath("/dashboard/income");
}
