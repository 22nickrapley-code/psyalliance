"use client";
import { useHub } from "../_components/profile-tabs";
import { PageCardLink } from "../_components/page-card";

// Availability, Credentials and the Continuity plan, as rows on your profile. All three open the same way,
// as a card over the profile, and closing the card leaves you here (Nick, 1 Nov).
const ROWS: { k: "availability" | "credentials" | "continuity"; label: string; hint: string; href: string }[] = [
  { k: "availability", label: "Availability", hint: "Your spaces, and how colleagues may approach you for referrals, cover and consults.", href: "/dashboard?availability=1" },
  { k: "credentials", label: "Credentials", hint: "Your licenses, and where their review stands.", href: "/dashboard/credentials" },
  { k: "continuity", label: "Continuity plan", hint: "Who steps in if you are suddenly unable to work.", href: "/dashboard/continuity" },
];

export function PracticeSetup() {
  const hub = useHub();
  return (
    <section className="card pf-block pf-setup" aria-labelledby="pf-setup-title">
      <h2 id="pf-setup-title" className="pf-block-title">Your practice setup</h2>
      <ul className="pf-rows">
        {ROWS.map((r) => {
          const st = hub?.[r.k];
          return (
            <li key={r.k} className={`pf-row tone-${st?.tone || "none"}`} data-block={r.k}>
              <div className="pf-row-text">
                <b>{r.label}</b>
                <span>{r.hint}</span>
              </div>
              {st && <span className={`pf-state tone-${st.tone}`}>{st.note}</span>}
              <PageCardLink href={r.href} title={r.label} className="pf-edit" >
                <span className="sr-only">Open {r.label}</span>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></svg>
              </PageCardLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
