// Which site this build is. Set at build time (NEXT_PUBLIC_* values are
// inlined), so the real site and the demo site are separate builds:
//   production  the real site: real members only
//   demo        the separately deployed demo Worker with its own Supabase
//               project, a guided tour and time-limited sandbox passes
export type AppEnv = "production" | "demo";

export const APP_ENV: AppEnv = process.env.NEXT_PUBLIC_APP_ENV === "demo" ? "demo" : "production";
export const IS_DEMO_SITE = APP_ENV === "demo";

// Public addresses: psyalliance.org for the real site, sandbox.psyalliance.org
// for the sandbox. The old *.workers.dev addresses still answer, but links
// never use them: a build setting that still names one is ignored, so an
// old .env file can't send people back there.
const REAL_DEFAULT = "https://psyalliance.org";
const DEMO_DEFAULT = "https://sandbox.psyalliance.org";
const address = (value: string | undefined, fallback: string) => (value && !/\.workers\.dev/i.test(value) ? value : fallback).replace(/\/$/, "");

export const REAL_SITE_URL = address(process.env.NEXT_PUBLIC_REAL_SITE_URL, REAL_DEFAULT);
export const DEMO_URL: string | null = address(process.env.NEXT_PUBLIC_DEMO_URL, DEMO_DEFAULT);
export const SITE_URL = address(process.env.NEXT_PUBLIC_SITE_URL, IS_DEMO_SITE ? DEMO_DEFAULT : REAL_DEFAULT);
// One door in: creating an account on the real site (sign-up is open; a
// person verifies every license and the network opens state by state).
export const JOIN_URL = `${REAL_SITE_URL}/auth/sign-up`;
export const JOIN_HREF = IS_DEMO_SITE ? JOIN_URL : "/auth/sign-up";
export const JOIN_LABEL = "Create your account";

// The demos live on the real site. The sandbox site sends visitors there.
export const TOUR_ENABLED = true;
export const TOUR_URL = IS_DEMO_SITE ? `${REAL_SITE_URL}/tour` : "/tour";

// The sandbox project, called from a real account to open a sandbox. The
// key is the public (publishable) key the sandbox site already ships.
// A build setting can point these at a local staging copy for testing.
export const SANDBOX_SUPABASE_URL = process.env.NEXT_PUBLIC_SANDBOX_SUPABASE_URL || "https://xsfqeepxnmnvlhxwkfnw.supabase.co";
export const SANDBOX_SUPABASE_KEY = process.env.NEXT_PUBLIC_SANDBOX_SUPABASE_KEY || "sb_publishable_FCl4vvKoongXIrfGQdGGQw_5Bb20GZY";
// Public pages (how it works, verification, story) live on the real site.
export const PUBLIC_BASE = IS_DEMO_SITE ? REAL_SITE_URL : "";
