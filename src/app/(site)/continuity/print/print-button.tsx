"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      Save as PDF or print
    </button>
  );
}
