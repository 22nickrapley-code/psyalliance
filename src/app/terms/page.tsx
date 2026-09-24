import "../premium.css";
import { PublicNav, PublicFooter } from "../_public/chrome";

export const metadata = { title: "Terms" };

// Plain-language terms while the full terms complete legal review.
export default function TermsPage() {
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 760 }}>
            <div className="section-intro">
              <div className="eyebrow">Terms</div>
              <h2>The basics.</h2>
              <p>Plain-language terms while our full terms complete legal review. Questions: <a href="mailto:hello@psyalliance.org">hello@psyalliance.org</a>.</p>
            </div>
            <p>
              PsyAlliance is a professional network for verified doctoral-level psychologists and psychiatrists. It doesn&rsquo;t replace your professional judgment.
              What you see about a colleague (licences, availability, specialties) is what is on file, with dates, not a guarantee that they suit a particular patient.
            </p>
            <p>
              Keep patient-identifying information out of PsyAlliance, act within your licence and your state&rsquo;s rules, and treat what colleagues share as confidential.
              Practice Library templates show whether they have been independently reviewed; adapt any template with your own advisers before you rely on it.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
