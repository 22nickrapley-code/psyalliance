import { JOIN_URL } from "@/lib/env";
import "../../premium.css";
import { notFound } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { PublicNav, PublicFooter } from "../../_public/chrome";

export const metadata = { title: "Tour complete", robots: { index: false, follow: false } };

// What the fictional story achieved, and where to go next.
export default function TourDonePage() {
  if (!TOUR_ENABLED) notFound();
  const outcomes: [string, string][] = [
    ["Circle", "Seven trusted colleagues, three Alex has worked with and five saved, ranked first in every search."],
    ["Refer", "A new OCD enquiry shortlisted by fit and sent to three colleagues. Everyone replied, and it went to Samuel, whom Alex has worked with before."],
    ["Consult", "A practical question about the handover call, answered by the trusted circle, with the useful reply marked."],
    ["Cover", "Six weeks of leave, three cases described without identifiers. Maya covers two, and Eli, a psychiatrist, covers the one that needs prescribing. All three accepted."],
    ["Library", "The leave plan and handoff pack used where it was needed, with its review status shown."],
  ];
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 820 }}>
            <div className="section-intro">
              <div className="eyebrow">Tour complete</div>
              <h2>Six weeks away, covered.</h2>
              <p>What Alex&rsquo;s fictional practice got done, without a single client name entering PsyAlliance.</p>
            </div>
            <ol className="outcomes card">
              {outcomes.map(([k, v]) => (
                <li key={k}>
                  <span className="eyebrow">{k}</span>
                  <p>{v}</p>
                </li>
              ))}
            </ol>
            <div className="split equal" style={{ marginTop: 24 }}>
              <div className="card">
                <h3>Try it yourself</h3>
                <p className="small">Ask us for a personal sandbox: your own copy of the fictional practice for a week, where colleagues reply to what you send.</p>
                <a className="btn secondary small-btn" href="mailto:hello@psyalliance.org?subject=PsyAlliance%20sandbox">Ask for a sandbox</a>
              </div>
              <div className="card">
                <h3>Join the founding cohort</h3>
                <p className="small">We&rsquo;re inviting verified psychologists and psychiatrists a few states at a time.</p>
                <a className="btn small-btn" href={JOIN_URL}>Ask to join</a>
              </div>
            </div>
            <p className="small" style={{ marginTop: 20 }}><a className="text-arrow" href="/tour">&larr; Start the tour again</a></p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
