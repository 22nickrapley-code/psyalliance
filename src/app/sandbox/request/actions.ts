"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO_SITE, DEMO_URL } from "@/lib/env";
import { US_STATES } from "@/lib/us-states";

const ROLES = ["Psychologist", "Psychiatrist", "Practice owner", "Other"];

// A prospect asks for their own sandbox. The request lands in Admin >
// Sandbox passes; nothing is issued automatically.
export async function requestSandboxAction(formData: FormData) {
  if (!IS_DEMO_SITE && DEMO_URL && process.env.NODE_ENV === "production") redirect(`${DEMO_URL}/sandbox/request`);
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const role = String(formData.get("role") || "");
  const state = String(formData.get("state") || "").toUpperCase();
  const note = String(formData.get("note") || "").trim().slice(0, 600);
  if (fullName.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/sandbox/request?error=${encodeURIComponent("Add your name and a valid email address.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_sandbox", {
    p_full_name: fullName,
    p_email: email,
    p_role: ROLES.includes(role) ? role : "",
    p_state: US_STATES.some((s) => s.code === state) ? state : "",
    p_note: note,
  });
  if (error) redirect(`/sandbox/request?error=${encodeURIComponent(error.message)}`);
  redirect("/sandbox/request?sent=1");
}
