// Which site this build is. Set at build time (NEXT_PUBLIC_* values are
// inlined), so the real site and the demo site are separate builds:
//   production  psyalliance.org: real members only
//   demo        the separately deployed demo Worker with its own Supabase
//               project, a guided tour and time-limited sandbox passes
export type AppEnv = "production" | "demo";

export const APP_ENV: AppEnv = process.env.NEXT_PUBLIC_APP_ENV === "demo" ? "demo" : "production";
export const IS_DEMO_SITE = APP_ENV === "demo";

// Where the real site links to the demo (only if set).
export const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_URL || null;
// The tour is available on the demo site, and locally while developing.
export const TOUR_ENABLED = IS_DEMO_SITE || process.env.NODE_ENV !== "production";
