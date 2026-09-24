import "../../premium.css";
import { notFound } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { PublicNav, PublicFooter } from "../../_public/chrome";

export const metadata = { title: "Tour complete", robots: { index: false, follow: false } };

// What the fictional story achieved, and where to go next.
export default function TourDonePage() {
  if (!TOUR_ENABLED) notFound();
  const outcomes: [string, string][] = [
    ["Cover", "Three cases described without identifiers. Two covered by a trusted colleague within a day; the prescribing case waiting on a psychiatrist, next in line automatically."],
    ["Refer", "A new OCD enquiry shortlisted by fit, sent to three colleagues, two interested within hours. The client went to someone Alex has worked with before."],
    ["Consult", "A practical question answered by the trusted circle, with the useful reply marked."],
    ["Handover", "A joint call agreed in a message tied to the plan, with the clinical details kept outside PsyAlliance."],
    ["Library", "The leave plan and handoff pack used where it was needed, clearly marked as not yet independently reviewed."],
  ];
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 820 }}>
            <div className="section-intro">
              <div className="eyebrow">Tour complete</div>
              <h2>Six weeks away, handled.</h2>
              <p>What Alex&rsquo;s fictional practice got done, without a single client name entering PsyAlliance.</p>
            </div>
            <ul className="summary-list card">
              {outcomes.map(([k, v]) => (
                <li key={k}><b style={{ minWidth: 90 }}>{k}</b><span style={{ textAlign: "right" }}>{v}</span></li>
              ))}
            </ul>
            <div className="split equal" style={{ marginTop: 24 }}>
              <div className="card">
                <h3>Try it yourself</h3>
                <p className="small">Ask us for a personal sandbox: your own copy of the fictional practice for a week, where colleagues reply to what you send.</p>
                <a className="btn secondary small-btn" href="mailto:hello@psyalliance.org?subject=PsyAlliance%20sandbox">Ask for a sandbox</a>
              </div>
              <div className="card">
                <h3>Join the founding cohort</h3>
                <p className="small">We&rsquo;re inviting verified psychologists and psychiatrists a few states at a time.</p>
                <a className="btn small-btn" href={process.env.NEXT_PUBLIC_REAL_SITE_URL ? `${process.env.NEXT_PUBLIC_REAL_SITE_URL}/join` : "/join"}>Ask to join</a>
              </div>
            </div>
            <p className="small" style={{ marginTop: 20 }}><a href="/tour">Start the tour again</a></p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
