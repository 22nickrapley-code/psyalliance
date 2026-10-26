"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Root error boundary caught:", error);
  }, [error]);

  return (
    <main className="container" style={{ maxWidth: 560, textAlign: "center", paddingTop: "5rem" }}>
      <h1>Something went wrong</h1>
      <p className="error-banner" style={{ textAlign: "left" }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1rem" }}>
        <button onClick={() => reset()}>Try again</button>
        <a className="btn secondary" href="/">Back home</a>
      </div>
    </main>
  );
}
