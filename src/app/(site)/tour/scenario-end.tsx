"use client";
import { useEffect } from "react";
import { practiceEvent } from "./practice-events";

// The end of a need walkthrough: what happens next in the product, and the one button that carries the same need into sign-up.
export function ScenarioEnd({ need, summary, label, href }: { need: string; summary: string; label: string; href: string }) {
  useEffect(() => practiceEvent("interaction_complete", need), [need]);
  return (
    <section className="scenario-end" data-scenario-end>
      <p>{summary}</p>
      <a className="btn" href={href} onClick={() => practiceEvent("summary_continue", need)}>{label}</a>
      <a className="text-arrow" href="/start">Choose a different scenario</a>
    </section>
  );
}
