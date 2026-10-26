import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { StatesView, type StateRow } from "./view";

export const metadata = { title: "States" };

export default async function AdminStatesPage(props: { searchParams: Promise<{ error?: string; opened?: string; closed?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const sp = await props.searchParams;
  const { data, error } = await supabase.rpc("admin_states");
  return <StatesView rows={((data as StateRow[]) || [])} sp={{ ...sp, error: sp.error || error?.message }} />;
}
