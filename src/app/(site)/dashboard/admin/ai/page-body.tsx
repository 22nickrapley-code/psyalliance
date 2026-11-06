import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrRedirectPath } from "@/lib/admin";
import { AiView } from "./view";

export const metadata = { title: "AI" };

export default async function AdminAiPage(props: { searchParams: Promise<{ error?: string; on?: string; off?: string }> }) {
  const supabase = await createClient();
  const redirectPath = await requireAdminOrRedirectPath(supabase);
  if (redirectPath) redirect(redirectPath);
  const sp = await props.searchParams;
  const { data, error } = await supabase.rpc("admin_ai_overview");
  return <AiView info={(data as any) || null} keySet={!!process.env.ANTHROPIC_API_KEY} sp={{ ...sp, error: sp.error || error?.message }} />;
}
