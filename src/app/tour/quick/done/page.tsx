import "../../../premium.css";
import { notFound } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { PublicNav, PublicFooter } from "../../../_public/chrome";
import { NextMoves } from "../../next-moves";

export const metadata = { title: "Tour complete", robots: { index: false, follow: false } };

// End of the two-minute tour: the outcome, then optional chapters, then
// the two separate ways forward.
export default function QuickTourDonePage() {
  if (!TOUR_ENABLED) notFound();
  const more: [string, string, string][] = [
    ["Refer a new enquiry", "Describe a need, get an explained shortlist and choose from the replies.", "/tour/refer"],
    ["Ask colleagues a question", "A consultation answered by Alex's trusted circle.", "/tour/consult"],
    ["The full tour", "Profile, home, circle, messages and the Library, then everything above. About five minutes.", "/tour/profile"],
  ];
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 860 }}>
            <div className="section-intro">
              <div className="eyebrow">Two-minute tour complete</div>
              <h2>Six weeks away, every case covered.</h2>
              <p>
                Three cases described by need, colleagues chosen and asked in order, and every case accepted. No client name entered PsyAlliance; the
                handoffs happen between the clinicians, through their own secure channels.
              </p>
            </div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>See more of the story</div>
            <div className="more-chapters">
              {more.map(([t, d, href]) => (
                <a key={href} className="card chapter-link" href={href}>
                  <b>{t}</b>
                  <span className="small">{d}</span>
                  <span className="text-arrow">Open &rarr;</span>
                </a>
              ))}
            </div>
            <NextMoves />
            <p className="small" style={{ marginTop: 20 }}><a className="text-arrow" href="/tour">&larr; Back to the start</a></p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
