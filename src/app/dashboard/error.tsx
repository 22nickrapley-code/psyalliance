"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side log only - no error tracking service wired up yet.
    // eslint-disable-next-line no-console
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div className="card">
      <h2>Something went wrong loading this page</h2>
      <p className="error-banner">
        {error.message || "An unexpected error occurred."}
        {error.digest && (
          <>
            <br />
            <span className="muted">Reference: {error.digest}</span>
          </>
        )}
      </p>
      <p className="muted">
        This is usually temporary. Try again, or head back to the overview page.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
        <button onClick={() => reset()}>Try again</button>
        <a className="btn secondary" href="/dashboard">Back to overview</a>
      </div>
    </div>
  );
}
