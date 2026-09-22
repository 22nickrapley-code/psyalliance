import { createClient } from "@/lib/supabase/server";
import { confirmAvailability } from "./actions";

function daysAgo(iso: string | null): string {
  if (!iso) return "Never confirmed";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "Confirmed today";
  return `Confirmed ${days} day${days === 1 ? "" : "s"} ago`;
}

// Master Brief #31-32: availability as one of the most important pieces of
// professional data, kept fresh with a deliberately tiny, frequent
// interaction rather than a buried profile field. This is what Coverage's
// operational-fit matching stage and the future availability-reminder
// notification both read.
export default async function AvailabilityPage(props: { searchParams: Promise<{ confirmed?: string; error?: string }> }) {
  const { confirmed, error } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("referral_availability, coverage_availability, consultation_availability, availability_confirmed_at")
    .eq("id", user!.id)
    .maybeSingle();

  return (
    <div>
      <h1>Availability</h1>
      <p className="muted">
        Keep this current - it's what colleagues see when deciding whether to send you a referral,
        ask for coverage, or invite you into a consultation.
      </p>

      {confirmed && <div className="message-banner">Availability confirmed.</div>}
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <p className="muted">{daysAgo(profile?.availability_confirmed_at ?? null)}</p>
        <form action={confirmAvailability}>
          <div className="field">
            <label>Accepting referrals</label>
            <div className="field-row">
              {["yes", "limited", "no"].map((v) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <input
                    type="radio"
                    name="referral_availability"
                    value={v}
                    defaultChecked={(profile?.referral_availability || "yes") === v}
                  />
                  {v === "yes" ? "Yes" : v === "limited" ? "Limited" : "No"}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Available for temporary coverage</label>
            <div className="field-row">
              {[
                { v: "yes", label: "Yes" },
                { v: "ask_me", label: "Ask me" },
                { v: "no", label: "No" },
              ].map(({ v, label }) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <input
                    type="radio"
                    name="coverage_availability"
                    value={v}
                    defaultChecked={(profile?.coverage_availability || "ask_me") === v}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Available for consultation</label>
            <div className="field-row">
              {["yes", "limited", "no"].map((v) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <input
                    type="radio"
                    name="consultation_availability"
                    value={v}
                    defaultChecked={(profile?.consultation_availability || "yes") === v}
                  />
                  {v === "yes" ? "Yes" : v === "limited" ? "Limited" : "No"}
                </label>
              ))}
            </div>
          </div>

          <button type="submit">Confirm availability</button>
        </form>
      </div>
    </div>
  );
}
