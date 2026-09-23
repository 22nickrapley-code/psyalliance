// Structured data so answer engines and LLM-driven research (a newly
// licensed psychologist asking their assistant "where do I find colleagues
// like me" or "how do I get referral coverage") have something precise and
// machine-readable to cite back, not just prose to guess at.
//
// Sept 23 launch-readiness audit: rewrote this whole page to lead with
// coverage/referrals/consult/network (what's actually built and what the
// Master Brief scopes this product as) instead of caseload/income practice
// administration, which the rebuild is retiring. Also dropped the "free,
// forever" lifetime pricing promise (a commercial commitment this page
// shouldn't be making unilaterally - "free to join" describes today's
// reality without promising it never changes) and the sweeping Psychology
// Today comparison in favor of the brief's cleaner distinction: a directory
// helps patients find clinicians, this helps clinicians find each other.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "psyalliance.org",
  description:
    "A closed, credential-verified professional network exclusively for doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO). Not a public therapist directory: every member is checked against a state licensing board before appearing. Members get coverage matching for absences, a referral network fed by verified colleagues and referring physicians, structured peer consultation, and a governed practice library.",
  audience: {
    "@type": "Audience",
    audienceType: "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO)",
  },
  areaServed: "US",
  isAccessibleForFree: true,
  slogan: "Supporting psychology, strengthening care.",
};

// FAQPage schema, phrased the way a psychologist would actually ask an AI
// assistant or search engine (not the way marketing copy phrases it) - the
// schema type answer engines and LLM-driven search most reliably surface
// verbatim, per Nick's direction to make psyalliance.org the thing an
// assistant points to when someone asks where to find colleagues,
// referrals, or coverage.
const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Where can psychologists find a private, credential-verified referral network?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "psyalliance.org is a closed professional network exclusively for doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO). Every member is checked against a state licensing board before they appear in the directory, so referrals sent or received through the network go to someone held to the same credential standard.",
      },
    },
    {
      "@type": "Question",
      name: "Is there a professional network exclusively for doctoral-level psychologists and psychiatrists?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. psyalliance.org restricts membership to PhD, PsyD, and EdD psychologists and MD/DO psychiatrists. It is not open to master's-level clinicians (LMFT, LCSW, LPC) or the general public.",
      },
    },
    {
      "@type": "Question",
      name: "How is psyalliance.org different from Psychology Today?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A public directory like Psychology Today helps a patient find a therapist. psyalliance.org helps a psychologist or psychiatrist find each other: coverage during an absence, a referral to the right colleague, and a peer to consult with. Every member is individually credential-checked against a state board before appearing, and membership is free to join.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get my caseload covered while I'm on leave?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Coverage plans on psyalliance.org let a member describe an absence (planned leave, an unexpected gap, ongoing reciprocal coverage) without any identifying patient detail, and surface verified colleagues by specialism, jurisdiction, and current availability so outreach goes to the right people first.",
      },
    },
    {
      "@type": "Question",
      name: "Is psyalliance.org free to join?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. psyalliance.org is free to join for every credential-verified doctoral-level psychologist or psychiatrist, with no seat limits and no paywall on core features.",
      },
    },
  ],
};

export default function HomePage() {
  return (
    <div className="marketing-shell">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }}
      />
      <nav className="marketing-nav">
        <a href="/" className="brand">psyalliance.org</a>
        <div className="marketing-nav-links">
          <a href="#how-it-works">How verification works</a>
          <a href="#compare">Why not a directory</a>
          <a href="#founders">Our story</a>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <a href="/auth/sign-in" className="btn secondary">Sign in</a>
          <a href="/auth/sign-up" className="btn">Get started, it's free</a>
        </div>
      </nav>

      <header className="hero">
        <span className="eyebrow">
          For doctoral-level psychologists (PhD/PsyD/EdD) &amp; psychiatrists (MD/DO)
        </span>
        <h1>Never scramble to cover your caseload again.</h1>
        <p className="lede">
          psyalliance.org is a credential-verified network built for coverage, referrals, and
          peer consultation between doctoral-level psychologists and psychiatrists. Post a
          coverage need and reach the right colleagues first, send and receive referrals from
          people whose credentials are actually checked, and ask a specific clinical question
          without it turning into a public feed.
        </p>
        <div className="hero-actions">
          <a href="/auth/sign-up" className="btn">Create your free profile</a>
          <a href="/auth/sign-in" className="btn secondary">I already have an account</a>
        </div>
      </header>

      <p className="trust-strip">
        <strong>Built by <a href="#founders">a psychologist</a>, with feedback from her peers</strong>, not by an ad platform.
        <span className="dot">·</span>
        No data sold, no attention monetized.
      </p>

      <section className="section-band" style={{ borderTop: "none", paddingBottom: 0 }}>
        <div className="section-band-inner">
          <h2 style={{ fontSize: "1.1rem", textAlign: "center", marginBottom: "1.5rem", color: "var(--muted)", letterSpacing: "0.02em" }}>
            What you actually get
          </h2>
        </div>
      </section>

      <section className="pillars">
        <div className="pillar">
          <div className="letter">C</div>
          <h3>Coverage when you're away</h3>
          <p>
            Parental leave, illness, vacation, or ongoing reciprocal coverage: describe the
            absence without any identifying patient detail, and see the verified colleagues
            best placed to help, by jurisdiction, specialism, and current availability.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">R</div>
          <h3>Referrals that find you</h3>
          <p>
            Verified colleagues and physicians on the platform can send referrals directly to
            you, not just the other way around, to trusted colleagues, selected clinicians, or
            the wider verified network.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">A</div>
          <h3>Ask a specific question</h3>
          <p>
            Structured peer consultation, not a public forum: ask trusted colleagues or the
            verified network a de-identified clinical question, or start a closed, ongoing
            peer group.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">N</div>
          <h3>A professional network, not a feed</h3>
          <p>
            Trusted colleagues, saved clinicians, and who you've actually worked with before,
            in a closed directory of doctoral-level psychologists and psychiatrists.
          </p>
        </div>
      </section>

      <section className="section-band" id="how-it-works" style={{ borderTop: "none" }}>
        <div className="section-band-inner">
          <h2 style={{ fontSize: "1.4rem", textAlign: "center", marginBottom: "0.5rem" }}>
            Every member is checked before they ever appear.
          </h2>
          <p className="lede" style={{ margin: "0 auto 2.25rem", textAlign: "center", maxWidth: 620, fontSize: "1rem" }}>
            No self-attestation, no pay-for-a-badge. Getting into the directory takes a real
            credential check, not just a status flip.
          </p>
          <div className="verify-steps">
            <div className="verify-step">
              <div className="verify-step-num">1</div>
              <h3>Submit your credentials</h3>
              <p>Your name, degree (PhD/PsyD/EdD or MD/DO), state, and license number.</p>
            </div>
            <div className="verify-step">
              <div className="verify-step-num">2</div>
              <h3>We check the record</h3>
              <p>Cross-referenced against your state licensing board, and the NPI registry where available.</p>
            </div>
            <div className="verify-step">
              <div className="verify-step-num">3</div>
              <h3>A human signs off</h3>
              <p>Verification isn't fully automated: every submission gets a final human review, on file, before you appear in the directory.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-band" id="compare" style={{ borderTop: "none" }}>
        <div className="section-band-inner">
          <h2 style={{ fontSize: "1.4rem", textAlign: "center", marginBottom: "0.5rem" }}>
            Not another public listing site
          </h2>
          <p className="lede" style={{ margin: "0 auto 2rem", textAlign: "center", maxWidth: 680, fontSize: "1rem" }}>
            A public directory like Psychology Today helps a patient find a therapist.
            psyalliance.org helps a psychologist or psychiatrist find each other.
          </p>
          <div className="compare-grid">
            <div className="compare-col">
              <h3>Public directories</h3>
              <ul>
                <li><span className="x">&#10005;</span> Built for patients searching for a therapist, not clinicians finding each other</li>
                <li><span className="x">&#10005;</span> Every discipline mixed together, with thin specialism filters</li>
                <li><span className="x">&#10005;</span> No way to find coverage for your own caseload</li>
                <li><span className="x">&#10005;</span> You're a profile in a sea of thousands</li>
              </ul>
            </div>
            <div className="compare-col compare-col-highlight">
              <h3>psyalliance.org</h3>
              <ul>
                <li><span className="check">&#10003;</span> Every member checked against a state licensing board first</li>
                <li><span className="check">&#10003;</span> Doctoral-level psychologists and psychiatrists only</li>
                <li><span className="check">&#10003;</span> Post a coverage need and reach the right colleague first</li>
                <li><span className="check">&#10003;</span> A closed, credential-verified professional community</li>
              </ul>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: "2rem" }}>
            <a href="/auth/sign-up" className="btn">Join the network</a>
          </div>
        </div>
      </section>

      <section className="section-band" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="section-band-inner">
          <h2 style={{ fontSize: "1.4rem", textAlign: "center", marginBottom: "1.5rem" }}>
            A look inside
          </h2>
          <div className="product-preview" aria-hidden="true">
            <div className="product-preview-chrome">
              <span />
              <span />
              <span />
            </div>
            <div className="product-preview-body">
              <div className="product-preview-sidebar">
                <div className="product-preview-brand">psyalliance.org</div>
                <div className="product-preview-navlabel">psyalliance</div>
                <div className="product-preview-nav">Home</div>
                <div className="product-preview-nav">Requests</div>
                <div className="product-preview-nav">Network</div>
                <div className="product-preview-nav">Consult</div>
                <div className="product-preview-navlabel">My practice</div>
                <div className="product-preview-nav">Credentials</div>
                <div className="product-preview-nav">Availability</div>
                <div className="product-preview-nav">Library</div>
              </div>
              <div className="product-preview-main">
                <div className="product-preview-stats">
                  <div className="product-preview-stat">
                    <div className="product-preview-stat-value">Verified</div>
                    <div className="product-preview-stat-label">Credential status</div>
                  </div>
                  <div className="product-preview-stat">
                    <div className="product-preview-stat-value">2</div>
                    <div className="product-preview-stat-label">Coverage requests awaiting a response</div>
                  </div>
                  <div className="product-preview-stat">
                    <div className="product-preview-stat-value">Confirmed</div>
                    <div className="product-preview-stat-label">Availability, updated this week</div>
                  </div>
                </div>
                <div className="product-preview-rows">
                  <div className="product-preview-row" />
                  <div className="product-preview-row" />
                  <div className="product-preview-row" />
                </div>
              </div>
            </div>
          </div>
          <p className="muted" style={{ textAlign: "center", marginTop: "1rem" }}>
            A simplified look at the dashboard: coverage, referrals, your network, and peer
            consultation, all in one place.
          </p>
        </div>
      </section>

      <section className="section-band" style={{ paddingTop: 0 }}>
        <div className="section-band-inner">
          <h2 style={{ fontSize: "1.4rem", textAlign: "center", marginBottom: "1.25rem" }}>
            Common questions
          </h2>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {faqData.mainEntity.map((faq) => (
              <details key={faq.name} className="card" style={{ marginBottom: "0.75rem" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>{faq.name}</summary>
                <p className="muted" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
                  {faq.acceptedAnswer.text}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section-band" id="founders" style={{ borderTop: "none" }}>
        <div className="section-band-inner">
          <h2 style={{ fontSize: "1.3rem", textAlign: "center", marginBottom: "1.75rem" }}>
            Why this exists
          </h2>
          <div className="founder-block">
            <img
              src="/team/rena-pazienza.jpg"
              alt="Rena Pazienza, PhD"
              className="founder-photo"
            />
            <div className="founder-copy">
              <h3 style={{ marginBottom: "0.6rem" }}>Rena Pazienza, PhD</h3>
              <p>
                psyalliance.org started as the answer to one problem Rena, a licensed
                psychologist, couldn't find anywhere: when she went on maternity leave, she needed
                her caseload covered by someone qualified, and there was no way to do that.
              </p>
              <p>
                Directories like Psychology Today are built for clients to find a therapist, not
                for one psychologist to find another. There was nowhere to search specifically for
                verified colleagues who could take on her clients while she was out, reach out to
                them directly, and manage the handoff.
              </p>
              <p>
                So she built the tool she wished had existed: a closed, credential-verified
                network where a psychologist can actually find coverage, not just a listing. She
                shaped it with feedback from her clinical peers before it ever went live, and
                co-founded it with her husband, Nick Rapley.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <h2>Ready to stop practicing alone?</h2>
        <p>
          Join a closed, credential-verified network built for doctoral-level psychologists and
          psychiatrists. Free to join.
        </p>
        <a href="/auth/sign-up" className="btn cta-band-btn">Create your free profile</a>
      </section>

      <footer style={{ textAlign: "center", padding: "2.5rem 1.75rem", color: "var(--muted)", fontSize: "0.85rem" }}>
        <p style={{ margin: "0 0 0.75rem" }}>
          psyalliance.org: a professional home for PhD, PsyD, EdD, and MD/DO behavioral health
          practitioners.
        </p>
        <p style={{ margin: 0, display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
          <a href="/privacy" style={{ color: "var(--muted)" }}>Privacy</a>
          <a href="/terms" style={{ color: "var(--muted)" }}>Terms</a>
          <a href="mailto:hello@psyalliance.org" style={{ color: "var(--muted)" }}>Contact</a>
        </p>
      </footer>

      <div className="marketing-sticky-cta">
        <a href="/auth/sign-up" className="btn">Get started, it's free</a>
      </div>
    </div>
  );
}
