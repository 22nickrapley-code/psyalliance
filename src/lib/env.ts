// Which site this build is. Set at build time (NEXT_PUBLIC_* values are
// inlined), so the real site and the demo site are separate builds:
//   production  the real site: real members only
//   demo        the separately deployed demo Worker with its own Supabase
//               project, a guided tour and time-limited sandbox passes
export type AppEnv = "production" | "demo";

export const APP_ENV: AppEnv = process.env.NEXT_PUBLIC_APP_ENV === "demo" ? "demo" : "production";
export const IS_DEMO_SITE = APP_ENV === "demo";

// Public addresses. psyalliance.org is not connected to the Worker yet, so
// every link uses the workers.dev addresses until it is; switching is a
// one-line change here (or the NEXT_PUBLIC_* overrides at build time).
const REAL_DEFAULT = "https://psyalliance.22nickrapley.workers.dev";
const DEMO_DEFAULT = "https://psyalliance-demo.22nickrapley.workers.dev";

export const REAL_SITE_URL = (process.env.NEXT_PUBLIC_REAL_SITE_URL || REAL_DEFAULT).replace(/\/$/, "");
export const DEMO_URL: string | null = (process.env.NEXT_PUBLIC_DEMO_URL || DEMO_DEFAULT).replace(/\/$/, "");
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || (IS_DEMO_SITE ? DEMO_DEFAULT : REAL_DEFAULT)).replace(/\/$/, "");
export const JOIN_URL = `${REAL_SITE_URL}/join`;

// The tour is available on the demo site, and locally while developing.
export const TOUR_ENABLED = IS_DEMO_SITE || process.env.NODE_ENV !== "production";
