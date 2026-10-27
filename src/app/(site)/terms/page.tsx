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
              What you see about a colleague (licenses, availability, specialties) is what is on file, with dates, not a guarantee that they suit a particular client.
            </p>
            <p>
              Keep client-identifying information out of PsyAlliance, act within your license and your state&rsquo;s rules, and treat what colleagues share as confidential.
              Library templates are general guidance; adapt any template with your own advisers before you rely on it.
            </p>
            <p>
              <b>Founding members.</b> The first 40 members in each state whose license PsyAlliance approves are founding members. Places are counted in the
              order licenses are approved, in each member&rsquo;s main practice state, one place per person. Founding members never pay for membership, for as long
              as they remain members, including if PsyAlliance introduces fees later. A place can&rsquo;t be transferred and isn&rsquo;t reused if a member
              leaves. After a state&rsquo;s founding places are taken, membership in that state will be paid; PsyAlliance will publish the price before then.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
