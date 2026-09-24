import "../premium.css";
import { notFound } from "next/navigation";
import { TOUR_ENABLED } from "@/lib/env";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { STEPS, PEOPLE } from "./steps";

export const metadata = { title: "Guided tour", robots: { index: false, follow: false } };

// Start of the guided tour. No sign-in: one fictional story, told on the
// real screens, from both sides of a cover request.
export default function TourIntroPage() {
  if (!TOUR_ENABLED) notFound();
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section">
          <div className="section-inner" style={{ maxWidth: 860 }}>
            <div className="section-intro">
              <div className="eyebrow">Guided tour &middot; about three minutes</div>
              <h2>One practice, start to finish.</h2>
              <p>
                Follow a fictional psychologist through six weeks of planned leave: finding cover, referring a new enquiry, asking colleagues a question and
                handing over well. You&rsquo;ll see it from both sides.
              </p>
            </div>
            <div className="split equal" style={{ marginBottom: 24 }}>
              {(["alex", "maya"] as const).map((k) => (
                <div key={k} className="card">
                  <div className="eyebrow">{k === "alex" ? "You'll mostly be" : "And briefly"}</div>
                  <h3>{PEOPLE[k].name}</h3>
                  <p className="small" style={{ marginBottom: 0 }}>{PEOPLE[k].role}</p>
                </div>
              ))}
            </div>
            <ol className="tour-outline">
              {STEPS.map((s) => (
                <li key={s.slug}><a href={`/tour/${s.slug}`}>{s.title}</a></li>
              ))}
            </ol>
            <div className="row" style={{ gap: 10, marginTop: 20 }}>
              <a className="btn" href={`/tour/${STEPS[0].slug}`}>Start the tour &rarr;</a>
            </div>
            <p className="micro-note" style={{ marginTop: 18 }}>
              Everyone and everything in this tour is invented. No real clinicians, clients or outcomes are shown.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
