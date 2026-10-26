"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sandboxDestination } from "./open-sandbox";

// "Open your sandbox" on Home.
export async function openSandboxAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(await sandboxDestination(supabase, user));
}
