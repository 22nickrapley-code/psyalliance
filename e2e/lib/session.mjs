// Session cookies for a staging fixture account, minted in Node with the same
// library the app uses, so a password never reaches a browser trace.
import fs from "node:fs";
import { createServerClient } from "@supabase/ssr";

const STAGE = process.env.STAGE || "/opt/stage";
export const SUPABASE_URL = process.env.E2E_SUPABASE_URL || "http://127.0.0.1:54321";
const keys = () => Object.fromEntries(fs.readFileSync(`${STAGE}/secrets/keys.env`, "utf8").trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)));
const fixtures = () => JSON.parse(fs.readFileSync(`${process.env.FIXTURES || `${STAGE}/secrets/fixtures.json`}`, "utf8")).accounts;

export function fixtureAccount(key) {
  const a = fixtures()[key];
  if (!a) throw new Error(`No staging fixture called ${key}`);
  return { key, id: a.id, email: a.email, name: a.name };
}

export async function cookiesFor(key, baseURL) {
  const a = fixtures()[key];
  if (!a) throw new Error(`No staging fixture called ${key}`);
  let jar = [];
  const client = createServerClient(SUPABASE_URL, keys().STAGE_ANON_KEY, {
    cookies: {
      getAll: () => jar.map(({ name, value }) => ({ name, value })),
      setAll: (cs) => { for (const c of cs) { jar = jar.filter((j) => j.name !== c.name); if (c.value) jar.push(c); } },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: a.email, password: a.password });
  if (error) throw new Error(`Staging sign-in failed for ${key}: ${error.message}`);
  const host = new URL(baseURL).hostname;
  return jar.map((c) => ({ name: c.name, value: c.value, domain: host, path: "/", httpOnly: false, secure: false, sameSite: "Lax" }));
}
