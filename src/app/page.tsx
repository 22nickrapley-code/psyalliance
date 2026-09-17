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
        <h1>Supporting Psychologists, Strengthening Care</h1>
        <p className="lede">
          A closed, credential-verified network and virtual-practice toolkit built around
          coverage, community, and consultation — free for every verified clinician, forever.
        </p>
        <div className="hero-actions">
          <a href="/auth/sign-up" className="btn">Create your free profile</a>
          <a href="/auth/sign-in" className="btn secondary">I already have an account</a>
        </div>
      </header>

      <section className="pillars">
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
          <div className="letter">C</div>
          <h3>Peer conversation and insight</h3>
          <p>
            Town Hall channels organized by specialism, a directory of verified peers, and a
            referral engine that suggests the right colleague for the right client — community
            built for practicing clinicians, not another social feed.
          </p>
        </div>
        <div className="pillar">
          <div className="letter">C</div>
          <h3>Holistic support for practitioners</h3>
          <p>
            Track your caseload, licenses, CE credits, and insurance panels in one place, with
            expiration reminders before anything lapses — the practice-management layer most
            solo and small-group practitioners have never had.
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
