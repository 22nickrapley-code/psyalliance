"use client";

import { useEffect } from "react";

// If the workspace cannot load (a dropped connection or a server problem), say so plainly instead of showing a
// technical error. The Hub never says "You're up to date" without having been able to check, so a failed load
// ends here, with a way to try again.
export default function WorkspaceError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Workspace error boundary caught:", error);
  }, [error]);

  const button = {
    minHeight: 44,
    padding: "0 18px",
    borderRadius: 8,
    border: "1px solid #203b32",
    background: "#203b32",
    color: "#fff",
    font: "inherit",
    fontWeight: 600,
    cursor: "pointer",
  } as const;
  const link = { ...button, display: "inline-flex", alignItems: "center", background: "#fff", color: "#203b32", textDecoration: "none" } as const;

  return (
    <main
      role="alert"
      style={{ maxWidth: 560, margin: "0 auto", padding: "72px 20px", color: "#26352e", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", lineHeight: 1.5 }}
    >
      <h1 style={{ fontSize: 26, margin: "0 0 12px", color: "#142b23" }}>We could not load your workspace.</h1>
      <p style={{ margin: "0 0 20px", fontSize: 16 }}>
        Nothing you saved has been lost and nothing was sent. Check your connection and try again. If it keeps happening, wait a minute and reload.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" style={button} onClick={() => window.location.reload()}>
          Try again
        </button>
        <a href="/" style={link}>
          Back to the home page
        </a>
      </div>
    </main>
  );
}
