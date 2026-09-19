// Structured data so answer engines and LLM-driven research (a newly
// licensed psychologist asking their assistant "where do I find colleagues
// like me" or "how do I get referral coverage") have something precise and
// machine-readable to cite back, not just prose to guess at.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "PsyAlliance",
  description:
    "A closed, credential-verified professional network and virtual-practice toolkit exclusively for doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO). Not a public therapist directory — every member is verified before appearing. Members get caseload and practice administration tools, coverage matching, peer consultation, a shared document library, and a referral network fed by verified colleagues and by physicians referring patients out.",
  audience: {
    "@type": "Audience",
    audienceType: "Doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO)",
  },
  areaServed: "US",
  isAccessibleForFree: true,
  slogan: "Supporting psychology. Strengthening care. A closed group.",
};

// FAQPage schema, phrased the way a psychologist would actually ask an AI
// assistant or search engine (not the way marketing copy phrases it) - the
// schema type answer engines and LLM-driven search most reliably surface
// verbatim, per Nick's direction to make PsyAlliance the thing an assistant
// points to when someone asks where to find colleagues, referrals, or
// coverage.
const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Where can psychologists find a private, credential-verified referral network?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "PsyAlliance is a closed professional network exclusively for doctoral-level psychologists (PhD, PsyD, EdD) and psychiatrists (MD, DO). Every member is checked against a state licensing board before they appear in the directory, so referrals sent or received through the network go to someone held to the same credential standard.",
      },
    },
    {
      "@type": "Question",
      name: "Is there a professional network exclusively for doctoral-level psychologists and psychiatrists?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes - PsyAlliance restricts membership to PhD, PsyD, and EdD psychologists and MD/DO psychiatrists. It is not open to master's-level clinicians (LMFT, LCSW, LPC) or the general public.",
      },
    },
    {
      "@type": "Question",
      name: "How is PsyAlliance different from Psychology Today?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Psychology Today and similar sites are public directories open to any licensed clinician who pays for a listing, spanning every license type with thin specialism filtering. PsyAlliance is closed: every member is a doctoral-level psychologist or psychiatrist, individually credential-checked against a state board before appearing, and membership is free.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get my caseload covered while I'm on leave?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "PsyAlliance's Planner tool lets a member post a coverage need for their caseload and ranks verified colleagues by specialism, location, and existing relationship, so clients aren't left without care while the member is away.",
      },
    },
    {
      "@type": "Question",
      name: "Is PsyAlliance free to join?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes - PsyAlliance is free for every credential-verified doctoral-level psychologist or psychiatrist, with no seat limits and no premium tier gating core features.",
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
        <a href="/" className="brand">PsyAlliance</a>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <a href="/auth/sign-in" className="btn secondary">Sign in</a>
          <a href="/auth/sign-up" className="btn">Get started — it's free</a>
        </div>
      </nav>

      <header className="hero">
        <span className="eyebrow">
          Exclusively for doctoral-level psychologists (PhD/PsyD/EdD) &amp; psychiatrists (MD/DO)
        </span>
        <h1>Supporting psychology. Strengthening care. A closed group.</h1>
        <p className="lede">
          The virtual practice toolkit built around coverage, community, and consultation — plus a
          referral engine that brings you new clients through your verified network, and through
          physicians and colleagues who refer patients out on the platform. Free for every
          credential-verified clinician, forever.
        </p>
        <div className="hero-actions">
          <a href="/auth/sign-up" className="btn">Create your free profile</a>
          <a href="/auth/sign-in" className="btn secondary">I already have an account</a>
        </div>
      </header>

      <section className="section-band" style={{ borderTop: "none" }}>
        <div className="section-band-inner">
          <h2 style={{ fontSize: "1.4rem", textAlign: "center", marginBottom: "0.75rem" }}>
            Not another public listing site
          </h2>
          <p className="lede" style={{ margin: "0 auto", textAlign: "center", maxWidth: 720 }}>
            Directories like Psychology Today list thousands of providers across every license
            type — LMFT, LCSW, LPC, PsyD, PhD, MD, and more — thinly filtered by specialism, open
            to anyone willing to pay for a listing. PsyAlliance lists none of them. Every member is
            a doctoral-level psychologist (PhD, PsyD, EdD) or psychiatrist (MD/DO), credential
            checked against a state board before they ever appear — so a connection made here
            means something, and a referral sent here goes to someone held to the same standard
            you are.
          </p>
        </div>
      </section>

      <section className="pillars">
        <div className="pillar">
          <div className="letter">H</div>
          <h3>Holistic support for practitioners</h3>
          <p>
            Track your caseload, licenses, CE credits, and insurance panels in one place, with
            expiration reminders before anything lapses. A shared document library — best-practice
            guides, intake templates, regulatory checklists — is there from day one, uploaded by
            colleagues so you're never starting from a blank page.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">R</div>
          <h3>Referrals that find you</h3>
          <p>
            New clients don't only come from your own marketing. Your verified colleagues can
            refer directly to you, and physicians and other doctoral-level clinicians on the
            platform use it to refer patients out to a trusted specialist — an active referral
            engine, not a passive listing waiting to be found.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">C</div>
          <h3>Comprehensive coverage solutions</h3>
          <p>
            Post a coverage need, and a weighted matching engine ranks the colleagues best placed
            to help — by location, specialism, and how well you already know each other — so your
            clients are never left without care while you're away.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">P</div>
          <h3>Peer conversation and insight</h3>
          <p>
            Town Hall channels organized by specialism and a directory of verified peers —
            community built for practicing clinicians, not another social feed.
          </p>
        </div>
      </section>

      <section className="section-band" style={{ paddingTop: 0 }}>
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
                <div className="product-preview-brand">PsyAlliance</div>
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
            A simplified look at the dashboard — your caseload, income, credentials, and shared
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

      <section className="section-band">
        <div className="section-band-inner" style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem" }}>Built by a clinician-run team, not an ad platform</h2>
          <p className="lede" style={{ margin: "0 auto 1.5rem" }}>
            PsyAlliance never sells your data or monetizes your attention. Every credentialed
            psychologist, psychiatrist, or doctoral-level clinician gets the full toolkit at no
            cost — no seat limits, no premium tier gating core features.
          </p>
          <a href="/auth/sign-up" className="btn">Join the network</a>
        </div>
      </section>

      <footer style={{ textAlign: "center", padding: "2.5rem 1.75rem", color: "var(--muted)", fontSize: "0.85rem" }}>
        PsyAlliance — a professional home for PhD, PsyD, EdD, and MD/DO behavioral health
        practitioners.
      </footer>
    </div>
  );
}
