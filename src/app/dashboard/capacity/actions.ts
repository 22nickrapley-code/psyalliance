"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A plain `throw` inside a server action wired to a bare <form action={fn}>
// crashes the whole page with Next.js's generic error screen instead of showing
// anything useful. Every validation/DB-error path in this file routes through
// this instead, so a bad input or a failed insert sends the user back to this
// same page with an inline banner rather than taking the page down.
function capacityError(message: string): never {
  redirect(`/dashboard/capacity?error=${encodeURIComponent(message)}`);
}

export async function saveCapacitySettings(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("capacity_settings").upsert({
    profile_id: user.id,
    target_sessions_per_week: parseFloat(String(formData.get("target_sessions_per_week") || "0")) || null,
    annual_vacation_days: parseInt(String(formData.get("annual_vacation_days") || "0")) || null,
    no_show_rate_pct: parseFloat(String(formData.get("no_show_rate_pct") || "0")) || null,
    missed_session_charge_pct: parseFloat(String(formData.get("missed_session_charge_pct") || "0")) || null,
  });
  if (error) capacityError(error.message);

  revalidatePath("/dashboard/capacity");
  redirect("/dashboard/capacity?saved=1");
}

export async function addOverheadExpense(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const cadence = String(formData.get("cadence") || "monthly");
  const amount = parseFloat(String(formData.get("amount") || "0")) || 0;
  const monthlyCost = cadence === "annual" ? amount / 12 : amount;
  const bookOfBusinessId = formData.get("book_of_business_id") ? Number(formData.get("book_of_business_id")) : null;

  const { error } = await supabase.from("practice_overhead_expenses").insert({
    profile_id: user.id,
    book_of_business_id: bookOfBusinessId,
    expense_name: String(formData.get("expense_name") || ""),
    vendor: String(formData.get("vendor") || "") || null,
    cadence,
    amount,
    monthly_cost: monthlyCost,
    notes: String(formData.get("notes") || "") || null,
  });
  if (error) capacityError(error.message);

  revalidatePath("/dashboard/capacity");
  revalidatePath("/dashboard/income");
}

export async function deleteOverheadExpense(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase.from("practice_overhead_expenses").delete().eq("id", id);
  if (error) capacityError(error.message);

  revalidatePath("/dashboard/capacity");
  revalidatePath("/dashboard/income");
}
