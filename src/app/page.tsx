// Structured data so answer engines and LLM-driven research (a newly
// licensed psychologist asking their assistant "where do I find colleagues
// like me" or "how do I get referral coverage") have something precise and
// machine-readable to cite back, not just prose to guess at.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "psyalliance.org",
  description:
    "A closed, credential-verified professional network and virtual-practice toolkit exclusively for doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO). Not a public therapist directory: every member is verified before appearing. Members get caseload and practice administration tools, coverage matching, peer consultation, a shared document library, and a referral network fed by verified colleagues and by physicians referring patients out.",
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
        text: "Psychology Today and similar sites are public directories open to any licensed clinician who pays for a listing, spanning every license type with thin specialism filtering. psyalliance.org is closed: every member is a doctoral-level psychologist or psychiatrist, individually credential-checked against a state board before appearing, and membership is free.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get my caseload covered while I'm on leave?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Planner tool on psyalliance.org lets a member post a coverage need for their caseload and ranks verified colleagues by specialism, location, and existing relationship, so clients aren't left without care while the member is away.",
      },
    },
    {
      "@type": "Question",
      name: "Is psyalliance.org free to join?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. psyalliance.org is free for every credential-verified doctoral-level psychologist or psychiatrist, with no seat limits and no premium tier gating core features.",
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
          Supporting psychology, strengthening care — psyalliance.org is the credential-verified
          network and virtual-practice toolkit built exclusively for doctoral-level psychologists
          and psychiatrists. Manage your caseload, get matched with coverage when you're away, and
          receive referrals from colleagues who know your credentials are real. Free, forever.
        </p>
        <div className="hero-actions">
          <a href="/auth/sign-up" className="btn">Create your free profile</a>
          <a href="/auth/sign-in" className="btn secondary">I already have an account</a>
        </div>
      </header>

      <p className="trust-strip">
        <strong>Built by <a href="#founders">a psychologist</a>, with feedback from her peers</strong> — not by an ad platform.
        <span className="dot">·</span>
        No data sold, no attention monetized, no premium tier.
      </p>

      <section className="pillars">
        <div className="pillar">
          <div className="letter">H</div>
          <h3>Holistic practice support</h3>
          <p>
            Caseload, licenses, CE credits, and insurance panels in one place, with expiration
            reminders before anything lapses.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">R</div>
          <h3>Referrals that find you</h3>
          <p>
            Verified colleagues and physicians on the platform refer patients directly to you,
            not just the other way around.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">C</div>
          <h3>Coverage when you're away</h3>
          <p>
            Parental leave, illness, vacation — post a coverage need and a weighted matching
            engine ranks the colleagues best placed to help, by location, specialism, and
            relationship, so no client is left without care.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">P</div>
          <h3>Peer consultation</h3>
          <p>
            Town Hall channels organized by specialism and a directory of verified peers, built
            for practicing clinicians.
          </p>
        </div>
      </section>

      <section className="section-band" id="how-it-works" style={{ borderTop: "none" }}>
        <div className="section-band-inner">
          <h2 style={{ fontSize: "1.4rem", textAlign: "center", marginBottom: "0.5rem" }}>
            Every member is checked before they ever appear.
          </h2>
          <p className="lede" style={{ margin: "0 auto 2.25rem", textAlign: "center", maxWidth: 620, fontSize: "1rem" }}>
            No self-attestation, no pay-for-a-badge. A membership here means something because
            getting in takes real verification.
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
              <p>Verification isn't fully automated — every submission gets a final human review before you appear in the directory.</p>
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
            Directories like Psychology Today list any licensed clinician willing to pay for a
            listing. psyalliance.org lists none of them.
          </p>
          <div className="compare-grid">
            <div className="compare-col">
              <h3>Public directories</h3>
              <ul>
                <li><span className="x">&#10005;</span> Anyone with a license and a credit card gets listed</li>
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
                <li><span className="check">&#10003;</span> Post a coverage need and get matched to the right colleague</li>
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
                <div className="product-preview-navlabel">My practice</div>
                <div className="product-preview-nav">Profile</div>
                <div className="product-preview-nav">Caseload</div>
                <div className="product-preview-nav">Income</div>
                <div className="product-preview-nav">Credentials</div>
                <div className="product-preview-nav">Documents</div>
                <div className="product-preview-navlabel">Network</div>
                <div className="product-preview-nav">Referrals</div>
                <div className="product-preview-nav">Planner</div>
              </div>
              <div className="product-preview-main">
                <div className="product-preview-stats">
                  <div className="product-preview-stat">
                    <div className="product-preview-stat-value">14</div>
                    <div className="product-preview-stat-label">Active clients</div>
                  </div>
                  <div className="product-preview-stat">
                    <div className="product-preview-stat-value">Verified</div>
                    <div className="product-preview-stat-label">Credential status</div>
                  </div>
                  <div className="product-preview-stat">
                    <div className="product-preview-stat-value">2</div>
                    <div className="product-preview-stat-label">Licenses expiring soon</div>
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
            A simplified look at the dashboard: caseload, income, credentials, and shared
            documents, all in one place.
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
                her caseload covered by someone qualified — and there was no way to do that.
              </p>
              <p>
                Directories like Psychology Today are built for clients to find a therapist, not
                for one psychologist to find another. There was nowhere to search specifically for
                verified colleagues who could take on her clients while she was out, reach out to
                them directly, and manage the handoff — and no single place to keep her own
                caseload organized in the first place.
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
          psychiatrists — free, forever.
        </p>
        <a href="/auth/sign-up" className="btn cta-band-btn">Create your free profile</a>
      </section>

      <footer style={{ textAlign: "center", padding: "2.5rem 1.75rem", color: "var(--muted)", fontSize: "0.85rem" }}>
        psyalliance.org: a professional home for PhD, PsyD, EdD, and MD/DO behavioral health
        practitioners.
      </footer>

      <div className="marketing-sticky-cta">
        <a href="/auth/sign-up" className="btn">Get started, it's free</a>
      </div>
    </div>
  );
}
