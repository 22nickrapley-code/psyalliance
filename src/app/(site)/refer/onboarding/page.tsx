import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { completeProviderOnboarding } from "../actions";

export default async function ProviderOnboardingPage(
  props: { searchParams: Promise<{ error?: string }> }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/refer-sign-in");

  const { data: existing } = await supabase
    .from("referring_providers")
    .select("approval_status")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) redirect(existing.approval_status === "approved" ? "/refer" : "/refer/pending");

  const defaultFullName = (user.user_metadata?.full_name as string | undefined) || "";

  return (
    <div>
      <h1>Finish your registration</h1>
      <p className="muted">
        A few details so we can confirm you're a practicing physician before your registration is
        reviewed.
      </p>

      {searchParams.error && <div className="error-banner">{searchParams.error}</div>}

      <div className="card">
        <form action={completeProviderOnboarding}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="full_name">Full name</label>
              <input id="full_name" name="full_name" type="text" defaultValue={defaultFullName} required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" defaultValue={user.email || ""} required />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="practice_name">Practice name</label>
              <input id="practice_name" name="practice_name" type="text" placeholder="Optional" />
            </div>
            <div className="field">
              <label htmlFor="npi_number">NPI number</label>
              <input id="npi_number" name="npi_number" type="text" placeholder="Optional" />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" placeholder="Optional" />
            </div>
          </div>
          <button type="submit">Submit for review</button>
        </form>
      </div>
    </div>
  );
}
