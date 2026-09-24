// Placeholder page so the public footer's Terms link resolves to something
// honest rather than a 404. Same caveat as /privacy: not a finished, binding
// terms-of-service document - needs real legal review before launch to a
// real clinician cohort. Flagged in the Sept 23 launch-readiness audit as
// missing.
export default function TermsPage() {
  return (
    <div className="marketing-shell">
      <nav className="marketing-nav">
        <a href="/" className="brand">psyalliance.org</a>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <a href="/auth/sign-in" className="btn secondary">Sign in</a>
          <a href="/auth/sign-up" className="btn">Join the network</a>
        </div>
      </nav>
      <section className="section-band" style={{ borderTop: "none" }}>
        <div className="section-band-inner" style={{ maxWidth: 720 }}>
          <h1 style={{ fontSize: "1.6rem", marginBottom: "1rem" }}>Terms of service</h1>
          <p className="muted">
            This page is a placeholder while our full terms of service are finalized with legal
            review. psyalliance.org is a professional network for verified doctoral-level
            psychologists and psychiatrists. It is not a substitute for a clinician&apos;s own
            professional judgment: information shown about another member (licenses, availability,
            specialism) reflects what is on file, not a guarantee of clinical or legal suitability
            for a given case.
          </p>
          <p className="muted">
            Questions in the meantime: email{" "}
            <a href="mailto:hello@psyalliance.org">hello@psyalliance.org</a>.
          </p>
        </div>
      </section>
    </div>
  );
}
