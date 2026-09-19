"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function sendConnectionRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const addresseeId = String(formData.get("addressee_id") || "");
  const tier = String(formData.get("tier") || "partner");

  const { error } = await supabase.from("connections").insert({
    requester_id: user.id,
    addressee_id: addresseeId,
    tier,
    status: "pending",
  });
  // 23505 = Postgres unique-violation - a request between these two people
  // already exists (in either direction, per the table's unique constraint).
  // Treat re-clicking "Connect" as a harmless no-op instead of a hard error.
  if (error && error.code !== "23505") throw new Error(error.message);

  revalidatePath("/dashboard/network");
  revalidatePath("/dashboard/people/[id]", "page");
}

export async function respondToConnection(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") || "accepted");

  const { error } = await supabase
    .from("connections")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/network");
  revalidatePath("/dashboard/people/[id]", "page");
}

export async function removeConnection(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));

  const { error } = await supabase.from("connections").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/network");
  revalidatePath("/dashboard/people/[id]", "page");
}
