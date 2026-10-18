"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { HubStates } from "@/lib/hub-states";
import { NavIcon } from "../icons";

// Profile holds everything about your own practice in one place: the
// profile colleagues see, your availability, your credentials and your
// continuity plan (Nick, 10 Oct: fewer items in the menu). The four parts
// are drawn as large tabs, each coloured by how complete it is (Nick,
// 18 Oct): green done, amber getting there or getting old, red missing.

const HubCtx = createContext<HubStates | null>(null);
export function HubProvider({ value, children }: { value: HubStates | null; children: ReactNode }) {
  return <HubCtx.Provider value={value}>{children}</HubCtx.Provider>;
}

const TABS: [k: "profile" | "availability" | "credentials" | "continuity", label: string, href: string, hint: string][] = [
  ["profile", "Profile", "/dashboard/profile", "What colleagues see"],
  ["availability", "Availability", "/dashboard/availability", "Referrals, cover, consults"],
  ["credentials", "Credentials", "/dashboard/credentials", "Licenses and review"],
  ["continuity", "Continuity plan", "/dashboard/continuity", "If you can't practice"],
];

export function ProfileTabs({ active, back }: { active: "profile" | "availability" | "credentials" | "continuity"; back?: string | null }) {
  const hub = useContext(HubCtx);
  // Moving between tabs keeps the way back to where you started.
  const keep = back && !back.startsWith("/dashboard/profile") ? `?back=${encodeURIComponent(back)}` : "";
  return (
    <nav className="section-tabs profile-tabs" aria-label="Your profile, in four parts">
      {TABS.map(([k, label, href, hint]) => {
        const state = hub?.[k];
        return (
          <a
            key={k}
            className={`section-tab${k === active ? " active" : ""}${state ? ` hub-${state.tone}` : ""}`}
            href={`${href}${keep}`}
            aria-current={k === active ? "page" : undefined}
          >
            <span className="st-icon" aria-hidden="true">
              <NavIcon name={k} size={18} />
            </span>
            <span className="st-text">
              <b>{label}</b>
              <small>{state ? state.note : hint}</small>
            </span>
            {state && <span className={`hub-dot hub-${state.tone}`} aria-label={state.tone === "green" ? "Done" : state.tone === "amber" ? "Needs attention" : "Missing"} />}
          </a>
        );
      })}
    </nav>
  );
}
