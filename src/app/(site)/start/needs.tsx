import { GUIDE, type Need } from "@/lib/start-guide";

// The six needs a visitor can pick on "Show me how PsyAlliance could help", shared by the
// choice page and the demo pages (so a visitor can pick another demo under the one they watched).
export const PRIMARY: Need[] = ["time_away", "client_referral", "caseload", "perspective", "reducing", "explore"];

export const NEED_LINE: Record<Need, string> = {
  time_away: "Leave, illness or a break, with each client covered.",
  client_referral: "An inquiry you can’t take, placed well.",
  caseload: "Referrals that fit your focus, from colleagues who are full.",
  perspective: "A focused question to colleagues you trust.",
  reducing: "Place clients carefully and plan what comes next.",
  explore: "A two-minute look at the whole product.",
  offer_support: "Be there for colleagues who need cover, referrals or advice.",
};

const NEED_PATH: Record<Need, string> = {
  time_away: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  client_referral: "M4 8h14l-3-3M20 16H6l3 3",
  caseload: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.8-3.5 3.2-5.5 6-5.5s5.2 2 6 5.5M18 8v6M15 11h6",
  perspective: "M5 18l-1 3 4-1.5A8 8 0 1 0 5 18z",
  reducing: "M4 12h10M10 6l6 6-6 6M20 5v14",
  explore: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  offer_support: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
};

export function NeedIcon({ need }: { need: Need | "library" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={need === "library" ? LIBRARY_TILE.path : NEED_PATH[need]} />
    </svg>
  );
}

// v7 (Nick, 9 Nov): the Library gets a demo of its own. It is a tile, not a sign-up goal (the goals are fixed in the
// database), so choosing it goes straight to the demo.
export const LIBRARY_TILE = {
  choice: "Find practice templates",
  line: "Leave, closing and continuity templates, ready to use.",
  href: "/tour/library",
  path: "M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2h6.5A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM8 12h8M8 15.5h5",
};

// Where each need's demo lives.
export const NEED_DEMO = (n: Need) => GUIDE[n].demo;
export const DEMO_NEED = (demoKey: string): Need | null => (PRIMARY.find((n) => GUIDE[n].demo === `/tour/${demoKey}`) as Need | undefined) || null;

// The other demos, as the same tiles as the choice page, shown under the demo being watched.
export function OtherNeeds({ current, ctx, demo }: { current: Need | null; ctx?: string; demo?: string }) {
  // Choosing another demo here is a deliberate change of goal (R08): "pick" carries it to that demo's Create account.
  const q = `?pick=1${ctx ? `&ctx=${encodeURIComponent(ctx)}` : ""}`;
  const tiles = PRIMARY.filter((n) => n !== current);
  const lib = demo !== "library";
  return (
    <nav className="guide-needs other-needs" aria-label="Watch another demo">
      {tiles.flatMap((n) => [
        ...(n === "explore" && lib ? [<LibraryTile key="library" />] : []),
        <a key={n} className={`need-${n}`} href={`${NEED_DEMO(n)}${q}`}>
          <span className="need-ic"><NeedIcon need={n} /></span>
          <span className="need-txt">
            <b>{GUIDE[n].choice}</b>
            <small>{NEED_LINE[n]}</small>
          </span>
        </a>,
      ])}
      {!tiles.includes("explore") && lib && <LibraryTile />}
    </nav>
  );
}

export function LibraryTile() {
  return (
    <a className="need-library" href={LIBRARY_TILE.href}>
      <span className="need-ic"><NeedIcon need="library" /></span>
      <span className="need-txt">
        <b>{LIBRARY_TILE.choice}</b>
        <small>{LIBRARY_TILE.line}</small>
      </span>
    </a>
  );
}
