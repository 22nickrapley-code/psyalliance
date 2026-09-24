// The physician referral portal is paused before launch: it collected
// patient initials and contact details, which PsyAlliance doesn't hold.
// Re-opening it is a product decision (see the launch notes).
export default function PortalClosedPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <a href="/" className="brand">psyalliance</a>
        <div className="card">
          <h2>The physician referral portal isn&rsquo;t open</h2>
          <p className="muted">
            PsyAlliance is opening to a founding group of psychologists and psychiatrists first. Referring physicians can&rsquo;t register yet.
            To reach us, email <a href="mailto:hello@psyalliance.org">hello@psyalliance.org</a>.
          </p>
          <a href="/" className="btn secondary">Back to PsyAlliance</a>
        </div>
      </div>
    </div>
  );
}
