export default function NotFound() {
  return (
    <main className="container" style={{ maxWidth: 560, textAlign: "center", paddingTop: "5rem" }}>
      <h1>Page not found</h1>
      <p className="muted">
        The page you&apos;re looking for doesn&apos;t exist, or you may need to sign in first.
      </p>
      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
        <a className="btn" href="/dashboard">Go to dashboard</a>
        <a className="btn secondary" href="/">Home</a>
      </div>
    </main>
  );
}
