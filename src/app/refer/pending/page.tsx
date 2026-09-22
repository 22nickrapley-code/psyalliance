import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProviderPendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/refer-sign-in");

  const { data: provider } = await supabase
    .from("referring_providers")
    .select("approval_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!provider) redirect("/refer/onboarding");
  if (provider.approval_status === "approved") redirect("/refer");
  if (provider.approval_status === "rejected") redirect("/refer/rejected");

  return (
    <div className="card" style={{ maxWidth: 520, margin: "2rem auto" }}>
      <h1 style={{ marginTop: 0 }}>Registration under review</h1>
      <p className="muted">
        Thanks for registering. An admin reviews every referring-provider registration before it's
        approved, usually within a couple of business days. You'll be able to sign back in here
        once it's approved.
      </p>
    </div>
  );
}
