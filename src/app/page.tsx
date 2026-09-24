import "./premium.css";

// Public landing (Product Spec v1, built from the premium concept Nick
// chose). Sections: hero with an illustrative cover plan, the three
// requests that matter, how verification works, the founder story, the
// trust rules, FAQ, and a founding-cohort call to action. No pricing is
// shown until it's decided.

const FAQ: [string, string][] = [
  [
    "Who can join?",
    "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO) in the US. It isn't open to the public or to master's-level clinicians.",
  ],
  [
    "How is this different from Psychology Today?",
    "A directory helps patients find you. PsyAlliance helps clinicians find each other: someone to cover you while you're away, the right colleague for a referral, and peers to think a case through with.",
  ],
  [
    "What does verified mean?",
    "An admin has reviewed your professional identity, your doctoral degree and at least one in-date licence, checked against the state board. You're listed and matched only in states where a reviewed licence is on file.",
  ],
  [
    "Do patient details go into PsyAlliance?",
    "No. Cover plans and referrals describe needs without identifiers (\"Case 3: adult, anxiety, telehealth, Aetna\"). Free text is checked for names, dates and contact details. The clinical handoff happens outside PsyAlliance once a colleague agrees.",
  ],
  [
    "How do I get cover while I'm on leave?",
    "Start a cover plan: add each case that needs cover without identifiers, and PsyAlliance suggests colleagues with the right licence, specialty and recently confirmed availability, trusted colleagues first. You choose who is asked and in what order.",
  ],
  [
    "Will I get a flood of notifications?",
    "No. You hear about things that need you: a cover request, a referral that fits your practice, a reply. Everything else waits for a weekly digest, and you control every email in Settings.",
  ],
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "PsyAlliance",
  url: "https://psyalliance.org",
  description:
    "A closed, credential-reviewed professional network for doctoral-level psychologists and psychiatrists in independent practice: cover for time away, considered referrals and peer consultation.",
  audience: { "@type": "Audience", audienceType: "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO)" },
  areaServed: "US",
};

const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

export default function HomePage() {
  return (
    <div className="pa">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }} />

      <nav className="public-nav" aria-label="Public">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">ψ</span>psyalliance
        </a>
        <div className="links">
          <a className="text-link" href="#how">How it works</a>
          <a className="text-link" href="#verification">Verification</a>
          <a className="text-link" href="#story">Our story</a>
          <a className="btn secondary small-btn" href="/auth/sign-in">Sign in</a>
          <a className="btn small-btn" href="/auth/sign-up">Join the network</a>
        </div>
      </nav>

      <main>
        <section className="public-hero">
          <div>
            <div className="eyebrow">For psychologists and psychiatrists</div>
            <h1>
              Independent practice. <em>Stronger together.</em>
            </h1>
            <p className="lead">
              Find trusted cover, exchange referrals and consult with verified colleagues. A professional circle built around the work you actually do.
            </p>
            <div className="hero-actions">
              <a className="btn" href="#how">See how it works &rarr;</a>
              <a className="btn secondary" href="#story">Our story</a>
            </div>
            <div className="hero-proof">
              <span className="seal" aria-hidden="true">ψ</span>
              <span>
                <b>Credentials reviewed before anyone joins the network</b>
                Identity, doctoral degree and state licence, checked by a person.
              </span>
            </div>
          </div>
          <div className="hero-visual" aria-label="Illustrative cover plan">
            <div className="visual-top">
              <span>Inside PsyAlliance</span>
              <span>Illustrative</span>
            </div>
            <div className="visual-card">
              <div className="eyebrow">Cover plan</div>
              <h3>A cover plan, without the scramble.</h3>
              <p>Extended leave &middot; New York &middot; October &middot; 2 cases</p>
              <div className="divider" style={{ margin: "16px 0 8px" }} />
              <div className="line">
                <span className="round-number">1</span>
                <span><b>Outline the need</b><br />Dates, jurisdiction and what each case needs</span>
              </div>
              <div className="line">
                <span className="round-number">2</span>
                <span><b>Review colleagues</b><br />Licence on file, specialty and fresh availability</span>
              </div>
              <div className="line">
                <span className="round-number">3</span>
                <span><b>Confirm the plan</b><br />Track every reply until each case is covered</span>
              </div>
            </div>
            <div className="visual-card row between">
              <div>
                <b style={{ fontSize: 13 }}>Case 1 covered</b>
                <div className="micro-note">Case 2 invited, awaiting a reply</div>
              </div>
              <span className="status warn">1 open</span>
            </div>
            <p className="micro-note" style={{ color: "#c6dbd2", margin: 0 }}>
              Example only. No patient identifiers are entered in PsyAlliance.
            </p>
          </div>
        </section>

        <div className="trust-row">
          <span>Credential review</span>
          <span>Clinician-to-clinician relationships</span>
          <span>No patient identifiers</span>
          <span>Never sold, never advertised to</span>
        </div>

        <section className="public-section tint" id="how">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">The network behind your practice</div>
              <h2>One place for the three requests that matter.</h2>
              <p>Make a clear request, choose who sees it and keep the next step visible.</p>
            </div>
            <div className="three-grid">
              <article className="editorial-card">
                <div className="n">01 / Cover</div>
                <h3>Plan for time away</h3>
                <p>A week off, parental leave, an unexpected absence or closing a practice. Describe each case without identifiers, invite colleagues deliberately and follow every open case to confirmation.</p>
              </article>
              <article className="editorial-card">
                <div className="n">02 / Refer</div>
                <h3>Make a considered referral</h3>
                <p>Search by specialty, state licence, insurance and current availability. Share a structured, non-identifying need with the colleagues you choose, then close the loop.</p>
              </article>
              <article className="editorial-card">
                <div className="n">03 / Consult</div>
                <h3>Think with peers</h3>
                <p>Ask one focused question of a colleague, your trusted circle or the wider network. Or run a closed consultation group with a written charter. Supervision lives here too.</p>
              </article>
            </div>
            <p style={{ marginTop: 26, maxWidth: 720 }}>
              Behind all three is your <b style={{ color: "var(--ink)" }}>circle</b>: trusted colleagues you choose, people you&rsquo;ve worked with before, and a reviewed Practice Library of templates for cover, referrals and consultation.
            </p>
          </div>
        </section>

        <section className="public-section" id="verification">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Verification</div>
              <h2>Everyone is checked before they appear.</h2>
              <p>No self-attestation and no paid badge. Verified means a person reviewed the evidence.</p>
            </div>
            <div className="steps-grid">
              <div className="step">
                <span className="k">Step 1</span>
                <b>You share your credentials</b>
                <p>Your degree, the states you&rsquo;re licensed in and each licence number and expiry.</p>
              </div>
              <div className="step">
                <span className="k">Step 2</span>
                <b>We check the record</b>
                <p>Against the state licensing board, with the NPI registry as a cross-check where it helps.</p>
              </div>
              <div className="step">
                <span className="k">Step 3</span>
                <b>A person signs off</b>
                <p>Only then are you listed. Each licence is reviewed separately, and expired licences drop off automatically.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section tint" id="story">
          <div className="section-inner founder">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/team/rena-pazienza.jpg" alt="Rena Pazienza, PhD" />
            <div>
              <div className="eyebrow">A note from the founder</div>
              <p className="quote" style={{ margin: "10px 0 18px" }}>&ldquo;Independent clinicians deserve a dependable professional circle.&rdquo;</p>
              <p>
                PsyAlliance began with a problem Rena Pazienza, PhD, a licensed psychologist, couldn&rsquo;t solve: going on maternity leave, she needed her caseload covered by someone qualified, and there was no good way to find them.
              </p>
              <p>
                Directories are built for patients to find a therapist, not for one clinician to find another. So she built the professional circle she wished she&rsquo;d had, shaped with feedback from her peers, and co-founded it with Nick Rapley.
              </p>
              <p style={{ marginBottom: 0 }}>
                <b style={{ color: "var(--ink)" }}>A directory helps patients find you. PsyAlliance helps clinicians find each other.</b>
              </p>
            </div>
          </div>
        </section>

        <section className="public-section" id="approach">
          <div className="section-inner">
            <div className="section-intro">
              <div className="eyebrow">Our approach</div>
              <h2>Rules we don&rsquo;t bend.</h2>
            </div>
            <ul className="rules">
              <li><b>No patient identifiers, ever</b>Cases are system references. Free text is checked for names, dates and contact details.</li>
              <li><b>Verified means reviewed</b>Listing and requests require a reviewed identity, degree and in-date licence.</li>
              <li><b>Facts, not judgements</b>Profiles show facts on file with dates. Whether a colleague suits a patient is your professional call.</li>
              <li><b>Nothing sends without review</b>Every request and post shows exactly who will see it before you confirm.</li>
              <li><b>Private by default</b>Who you save, exclude or block is never visible to them.</li>
              <li><b>Never sold, never advertised to</b>Your data isn&rsquo;t sold or used for advertising.</li>
            </ul>
          </div>
        </section>

        <section className="public-section tint" id="faq">
          <div className="section-inner" style={{ maxWidth: 780 }}>
            <div className="section-intro">
              <div className="eyebrow">Questions</div>
              <h2>What clinicians ask first.</h2>
            </div>
            <div className="faq">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section">
          <div className="section-inner pa-cta">
            <div>
              <div className="eyebrow" style={{ color: "#e2c49c" }}>Founding members</div>
              <h2>Join the first cohort.</h2>
              <p>We&rsquo;re opening PsyAlliance to a founding group of psychologists and psychiatrists first.</p>
            </div>
            <a className="btn" href="/auth/sign-up">Apply to join &rarr;</a>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div>
          <div className="brand"><span className="brand-mark" aria-hidden="true">ψ</span>psyalliance</div>
          <p>A professional network for independent psychologists and psychiatrists.</p>
        </div>
        <div className="foot-links">
          <a href="#how">How it works</a>
          <a href="#verification">Verification</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:hello@psyalliance.org">Contact</a>
          <a href="/auth/sign-in">Sign in</a>
        </div>
      </footer>
    </div>
  );
}
