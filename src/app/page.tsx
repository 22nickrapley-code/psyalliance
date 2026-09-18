export default function HomePage() {
  return (
    <div className="marketing-shell">
      <nav className="marketing-nav">
        <a href="/" className="brand">PsyAlliance</a>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <a href="/auth/sign-in" className="btn secondary">Sign in</a>
          <a href="/auth/sign-up" className="btn">Get started — it's free</a>
        </div>
      </nav>

      <header className="hero">
        <span className="eyebrow">For licensed psychologists &amp; psychiatrists</span>
        <h1>Supporting psychology. Strengthening care. A closed group.</h1>
        <p className="lede">
          A virtual practice toolkit built around coverage, community, and consultation — free
          for every credential-verified clinician, forever.
        </p>
        <div className="hero-actions">
          <a href="/auth/sign-up" className="btn">Create your free profile</a>
          <a href="/auth/sign-in" className="btn secondary">I already have an account</a>
        </div>
      </header>

      <section className="pillars">
        <div className="pillar">
          <div className="letter">H</div>
          <h3>Holistic support for practitioners</h3>
          <p>
            Track your caseload, licenses, CE credits, and insurance panels in one place, with
            expiration reminders before anything lapses — the practice-management layer most
            solo and small-group practitioners have never had.
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
            Town Hall channels organized by specialism, a directory of verified peers, and a
            referral engine that suggests the right colleague for the right client — community
            built for practicing clinicians, not another social feed.
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
