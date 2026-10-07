import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/env";
import { FullView } from "./view";

export const metadata = { title: "When you're full" };

export default async function FullPage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;
  const [{ data: page }, { data: listing }, { data: candidates }, { data: profile }] = await Promise.all([
    supabase.from("overflow_pages").select("*").eq("profile_id", me).maybeSingle<any>(),
    supabase.from("public_listings").select("*").eq("profile_id", me).maybeSingle<any>(),
    supabase.rpc("my_overflow_candidates"),
    supabase.rpc("my_profile").select("full_name, referral_availability").maybeSingle<any>(),
  ]);
  const suggestedSlug = String(profile?.full_name || "my-practice")
    .toLowerCase()
    .replace(/^(dr\.?)\s+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (
    <FullView
      sp={sp}
      page={page || null}
      listing={listing || null}
      candidates={(candidates as any[]) || []}
      base={`${SITE_URL}/full/`}
      suggestedSlug={suggestedSlug}
    />
  );
}
