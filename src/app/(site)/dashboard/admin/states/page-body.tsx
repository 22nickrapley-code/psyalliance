import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { StatesView, type StateRow } from "./view";

export const metadata = { title: "States" };

export default async function AdminStatesPage(props: { searchParams: Promise<{ error?: string; opened?: string; closed?: string; circle?: string; complete?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const sp = await props.searchParams;
  const [{ data, error }, { data: circles }] = await Promise.all([
    supabase.rpc("admin_states"),
    supabase.rpc("founding_circle_states"),
  ]);
  return <StatesView rows={((data as StateRow[]) || [])} circles={((circles as string[]) || [])} sp={{ ...sp, error: sp.error || error?.message }} />;
}
