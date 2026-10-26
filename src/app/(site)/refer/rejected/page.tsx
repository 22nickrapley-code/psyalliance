import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProviderRejectedPage() {
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
  if (provider.approval_status !== "rejected") redirect(provider.approval_status === "approved" ? "/refer" : "/refer/pending");

  return (
    <div className="card" style={{ maxWidth: 520, margin: "2rem auto" }}>
      <h1 style={{ marginTop: 0 }}>Registration not approved</h1>
      <p className="muted">
        Your referring-provider registration wasn't approved. If you think this is a mistake,
        contact PsyAlliance support.
      </p>
    </div>
  );
}
