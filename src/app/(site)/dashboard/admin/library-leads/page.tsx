import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import type { LeadsData } from "./load";
import { LeadsView } from "./view";

export const metadata = { title: "Library leads" };

// Who asked for a template from the public Library, and which templates
// bring people to ask to join. Email isn't wired yet, so follow-up is by
// hand from the CSV.
export default async function LibraryLeadsPage(props: { searchParams: Promise<{ doc?: string; intent?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const sp = await props.searchParams;
  const doc = (sp.doc || "").toUpperCase().slice(0, 10);
  const intent = sp.intent === "download" || sp.intent === "notify" ? sp.intent : "";
  const { data, error } = await supabase.rpc("admin_library_leads");
  return <LeadsView d={(data as LeadsData) || { leads: [], joins: {} }} doc={doc} intent={intent} error={error?.message || null} />;
}
