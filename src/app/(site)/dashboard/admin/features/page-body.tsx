import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { FeaturesView } from "./view";

export const metadata = { title: "Features" };

export default async function AdminFeaturesPage(props: { searchParams: Promise<{ error?: string; on?: string; off?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const sp = await props.searchParams;
  const { data, error } = await supabase.rpc("admin_features");
  return <FeaturesView info={(data as any) || null} sp={{ ...sp, error: sp.error || error?.message }} />;
}
