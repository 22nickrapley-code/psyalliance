import fs from "node:fs";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

// Signing in without putting a password in a trace, screenshot or log.
//
// Staging: fixture accounts on the local stack. The session is created in
// Node with the same @supabase/ssr library the app uses, and only the
// resulting session cookie is handed to the browser.
// Live: the browser sign-ins Nick saved himself with `npm run login:live`
// (e2e/.auth/*.json, git-ignored). The suite never sees a live password.

const STAGE = process.env.STAGE || "/opt/stage";

export type Account = { key: string; id: string; email: string; name: string };

function stagingKeys(): Record<string, string> {
  const raw = fs.readFileSync(`${STAGE}/secrets/keys.env`, "utf8");
  return Object.fromEntries(raw.trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2) as [string, string]));
}

function stagingFixtures(): Record<string, Account & { password: string }> {
  const raw = JSON.parse(fs.readFileSync(`${STAGE}/secrets/fixtures.json`, "utf8"));
  return Object.fromEntries(Object.entries(raw.accounts).map(([k, v]: [string, any]) => [k, { key: k, ...v }]));
}

export const SUPABASE_URL = process.env.E2E_SUPABASE_URL || "http://127.0.0.1:54321";

export function account(key: string): Account {
  const a = stagingFixtures()[key];
  if (!a) throw new Error(`No staging fixture called ${key}`);
  return { key: a.key, id: a.id, email: a.email, name: a.name };
}

export function anonKey(): string {
  return stagingKeys().STAGE_ANON_KEY;
}

export function serviceKey(): string {
  return stagingKeys().STAGE_SERVICE_KEY;
}

// Sign a staging fixture into the browser context.
export async function signInAs(context: BrowserContext, key: string, baseURL: string) {
  const a = stagingFixtures()[key];
  if (!a) throw new Error(`No staging fixture called ${key}`);
  let jar: { name: string; value: string; options?: any }[] = [];
  const client = createServerClient(SUPABASE_URL, anonKey(), {
    cookies: {
      getAll: () => jar.map(({ name, value }) => ({ name, value })),
      setAll: (cs) => {
        for (const c of cs) {
          jar = jar.filter((j) => j.name !== c.name);
          if (c.value) jar.push(c);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: a.email, password: a.password });
  if (error) throw new Error(`Staging sign-in failed for ${key}: ${error.message}`);
  const host = new URL(baseURL).hostname;
  await context.clearCookies();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: host, path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const })));
  return { key, id: a.id, email: a.email, name: a.name };
}

// For tests that must type a password into the real sign-in form (the
// sign-in journey itself). Callers turn tracing off around it.
export function stagingPassword(key: string): string {
  return stagingFixtures()[key].password;
}

// Live: a saved browser sign-in, created by Nick in a visible browser.
export function liveState(key: string): string {
  const p = path.resolve(process.cwd(), ".auth", `${key}.json`);
  if (!fs.existsSync(p)) throw new Error(`No saved sign-in for ${key}. Run: npm run login:live -- ${key}`);
  return p;
}

// A supabase-js client signed in as a staging fixture: the same API calls
// the app's server actions make, with the member's own permissions (RLS).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export async function memberClient(key: string): Promise<SupabaseClient> {
  const a = stagingFixtures()[key];
  if (!a) throw new Error(`No staging fixture called ${key}`);
  const c = createClient(SUPABASE_URL, anonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: a.email, password: a.password });
  if (error) throw new Error(`Staging sign-in failed for ${key}: ${error.message}`);
  return c;
}

// A throwaway staging account for destructive tests (erasure). Random
// password, kept in memory only for the test that made it.
export async function disposableMember(label: string) {
  const crypto = await import("node:crypto");
  const email = `${label}-${crypto.randomBytes(4).toString("hex")}@mail.staging.example`;
  const password = `Dx-${crypto.randomBytes(12).toString("base64url")}`;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: `Disposable ${label}` } }),
  });
  const user = await r.json();
  if (!r.ok) throw new Error(`disposable: ${r.status} ${user.msg || user.message}`);
  const c = createClient(SUPABASE_URL, anonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`disposable sign-in: ${error.message}`);
  return { id: user.id as string, email, client: c };
}
