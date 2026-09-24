import { createClient } from "@/lib/supabase/server";
import { applyAvailabilityCheck } from "./actions";
import "../../premium.css";

export const metadata = { title: "Check your availability", robots: { index: false, follow: false } };

const Q: { name: "referral" | "cover" | "consult"; title: string; options: [string, string][] }[] = [
  { name: "referral", title: "Accepting referrals", options: [["yes", "Yes"], ["limited", "Selected only"], ["no", "No"]] },
  { name: "cover", title: "Available for cover", options: [["yes", "Yes"], ["ask_me", "Ask me"], ["no", "No"]] },
  { name: "consult", title: "Open to consult", options: [["yes", "Yes"], ["no", "Not now"]] },
];

// Monthly availability check from email. No sign-in: the link's token is
// the credential. Answers are pre-filled with the current status, so
// "nothing's changed" is a single press of Confirm.
export default async function AvailabilityCheckPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; failed?: string }>;
}) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("availability_check_read", { p_token: token });
  const row = Array.isArray(data) ? data[0] : null;

  const current = {
    referral: row?.referral || "",
    cover: row?.cover || "",
    consult: row?.consult === "limited" ? "yes" : row?.consult || "",
  };

  let body;
  if (sp.done) {
    body = (
      <>
        <h1>Thank you{row?.first_name ? `, ${row.first_name}` : ""}.</h1>
        <p>Your availability is confirmed as of today. Colleagues will see it straight away.</p>
        <a className="btn secondary" href="/dashboard/availability">Open PsyAlliance</a>
      </>
    );
  } else if (!row || !row.valid || row.used || sp.failed) {
    body = (
      <>
        <h1>This link has expired.</h1>
        <p>Links from the monthly check work once and last 30 days. You can confirm your availability after signing in.</p>
        <a className="btn" href="/dashboard/availability">Sign in and confirm</a>
      </>
    );
  } else {
    body = (
      <>
        <div className="eyebrow">Monthly check</div>
        <h1>Is this still right{row.first_name ? `, ${row.first_name}` : ""}?</h1>
        <p>Colleagues rely on this when they refer or look for cover. Change anything that&rsquo;s moved on, then confirm.</p>
        <form action={applyAvailabilityCheck} className="stack" style={{ marginTop: 18 }}>
          <input type="hidden" name="token" value={token} />
          {Q.map((q) => (
            <fieldset key={q.name} className="signal" style={{ border: 0, margin: 0, paddingLeft: 0, paddingRight: 0 }}>
              <legend className="sr-only">{q.title}</legend>
              <h3>{q.title}</h3>
              <div className="seg">
                {q.options.map(([v, label]) => (
                  <label key={v}>
                    <input type="radio" name={q.name} value={v} required defaultChecked={current[q.name] === v} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button type="submit" className="btn" style={{ alignSelf: "flex-start", marginTop: 6 }}>Confirm</button>
        </form>
      </>
    );
  }

  return (
    <div className="pa" style={{ minHeight: "100vh" }}>
      <header className="public-nav">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">ψ</span> psyalliance
        </a>
      </header>
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 20px 80px" }}>
        <section className="card">{body}</section>
        <p className="micro-note" style={{ marginTop: 14 }}>No patient information is involved. You can change what we email you in Settings.</p>
      </main>
    </div>
  );
}
