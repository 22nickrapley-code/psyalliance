import "../premium.css";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { JOIN_HREF } from "@/lib/env";

export const metadata = {
  title: "Verification",
  description:
    "How PsyAlliance verifies doctoral-level psychologists and psychiatrists: every license is checked against the state board and signed off by a person before anyone is listed.",
};

// How verification works. Moved here from the home page so the home page
// can stay short; linked from its trust section and the footer.
const STEPS: [string, string, string][] = [
  ["Step 1", "You share your credentials", "Your doctoral degree, the states you’re licensed in, and each license number and expiry date."],
  ["Step 2", "We check the record", "Against the state licensing board, with the NPI registry as a cross-check where it helps."],
  ["Step 3", "A person signs off", "Only then are you listed. Each license is reviewed separately, and expired licenses drop off automatically."],
];

export default function VerificationPage() {
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner">
            <div className="section-intro verify-intro">
              <div className="eyebrow">Verification</div>
              <h2>Everyone is checked before they appear.</h2>
              <p>No self-attestation and no paid badge. Verified means a person reviewed the evidence.</p>
            </div>
            <div className="steps-grid">
              {STEPS.map(([k, t, b]) => (
                <div key={k} className="step">
                  <span className="k">{k}</span>
                  <b>{t}</b>
                  <p>{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section tint">
          <div className="section-inner" style={{ maxWidth: 760 }}>
            <h3>What &ldquo;verified&rdquo; means</h3>
            <p>
              A person has reviewed your professional identity, your doctoral degree and at least one in-date license, checked against the state board. You&rsquo;re
              listed and matched only in states where a reviewed license is on file. Members who aren&rsquo;t verified yet can&rsquo;t see anyone else.
            </p>
            <h3 style={{ marginTop: 28 }}>Who can join</h3>
            <p style={{ marginBottom: 0 }}>
              Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) licensed in the US. PsyAlliance isn&rsquo;t open to the public or to
              master&rsquo;s-level clinicians.
            </p>
          </div>
        </section>

        <section className="public-section">
          <div className="section-inner pa-cta">
            <div>
              <div className="eyebrow" style={{ color: "#e2c49c" }}>Founding members</div>
              <h2>Join the founding cohort.</h2>
              <p>Free for founding members. Opening state by state, starting in the Northeast.</p>
            </div>
            <a className="btn" href={JOIN_HREF}>Request an invitation &rarr;</a>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
