"use client";

import { useEffect } from "react";

// When a page or a save doesn't finish (a dropped connection or a server
// hiccup), say plainly what may have happened and how to check, rather
// than show a technical error.
export default function DashboardError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div className="card roomy" role="alert" style={{ maxWidth: 640 }}>
      <div className="eyebrow">That didn&rsquo;t finish</div>
      <h2 className="serif-title" style={{ fontSize: 28, margin: "6px 0 10px" }}>The page didn&rsquo;t load completely.</h2>
      <p>
        If you were saving something, it may already have saved. Reload this page to see where things stand before trying again; checking never
        saves anything twice.
      </p>
      <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
        <button type="button" className="btn" onClick={() => window.location.reload()}>Reload this page</button>
        <a className="btn secondary" href="/dashboard" data-reload="">Back to Home</a>
      </div>
      {error.digest && <p className="micro-note" style={{ marginTop: 14 }}>Reference {error.digest}</p>}
    </div>
  );
}
