"use client";

import { useState } from "react";

// A read-only link with a Copy button. Falls back to selecting the text
// where the clipboard isn't available.
export function CopyLink({ value, label = "Link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-link">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn secondary small-btn"
        onClick={async (e) => {
          const input = e.currentTarget.previousElementSibling as HTMLInputElement | null;
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            input?.select();
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
