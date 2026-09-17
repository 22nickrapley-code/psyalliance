export default function HomePage() {
  return (
    <main className="container" style={{ maxWidth: 640, textAlign: "center", paddingTop: "5rem" }}>
      <h1>PsyAlliance</h1>
      <p className="muted">
        A closed professional network and virtual-practice toolkit for PhD/PsyD/EdD
        psychologists and psychiatrists.
      </p>
      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
        <a className="btn" href="/auth/sign-up">Get started</a>
        <a className="btn secondary" href="/auth/sign-in">Sign in</a>
      </div>
    </main>
  );
}
