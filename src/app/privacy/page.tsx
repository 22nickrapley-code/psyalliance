// Placeholder page so the public footer's Privacy link resolves to something
// honest rather than a 404. This is deliberately not a finished privacy
// policy - the actual policy needs real legal review (data handling across
// Supabase/Cloudflare, HIPAA-adjacent considerations given the clinical
// audience, state-specific requirements) before it can be published as
// binding. Flagged in the Sept 23 launch-readiness audit as missing.
export default function PrivacyPage() {
  return (
    <div className="marketing-shell">
      <nav className="marketing-nav">
        <a href="/" className="brand">psyalliance.org</a>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <a href="/auth/sign-in" className="btn secondary">Sign in</a>
          <a href="/auth/sign-up" className="btn">Get started, it's free</a>
        </div>
      </nav>
      <section className="section-band" style={{ borderTop: "none" }}>
        <div className="section-band-inner" style={{ maxWidth: 720 }}>
          <h1 style={{ fontSize: "1.6rem", marginBottom: "1rem" }}>Privacy policy</h1>
          <p className="muted">
            This page is a placeholder while our full privacy policy is finalized with legal
            review. In the meantime, the short version: we don&apos;t sell member data, and we
            don&apos;t use it for advertising. Profile and credential information you submit is
            used to verify your identity and connect you with other verified clinicians on the
            platform.
          </p>
          <p className="muted">
            If you have a specific question about how your information is handled, email us at{" "}
            <a href="mailto:hello@psyalliance.org">hello@psyalliance.org</a> and we&apos;ll
            answer directly.
          </p>
        </div>
      </section>
    </div>
  );
}
