"use client";

// This catches errors thrown by the root layout itself (globals.css, the
// layout component, etc). Because it replaces the root layout entirely when
// active, it has to render its own <html>/<body> - Next.js requires this.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          background: "#f7f7f5",
          color: "#1c1c1a",
        }}
      >
        <main style={{ maxWidth: 560, margin: "5rem auto", textAlign: "center", padding: "0 1.5rem" }}>
          <h1>PsyAlliance hit a snag</h1>
          <p style={{ color: "#a3372c", background: "#fbe9e7", border: "1px solid #e3a89f", borderRadius: 6, padding: "0.75rem 1rem" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#2c5f4c",
              color: "#fff",
              border: "none",
              padding: "0.55rem 1.1rem",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
