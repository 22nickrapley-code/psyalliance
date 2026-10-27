// The account pages' own "not found": a page the member may not see (the admin
// pages, for anyone who isn't an operator) answers exactly as it did before the
// pages moved into the workspace's look, with the same words and the same two links.
export default function NotFound() {
  return (
    <div className="pa account-page">
      <main id="main" className="page" tabIndex={-1} style={{ maxWidth: 560, textAlign: "center", paddingTop: "5rem" }}>
        <h1>Page not found</h1>
        <p className="muted">The page you&apos;re looking for doesn&apos;t exist, or you may need to sign in first.</p>
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <a className="btn" href="/dashboard">Go to dashboard</a>
          <a className="btn secondary" href="/">Home</a>
        </div>
      </main>
    </div>
  );
}
