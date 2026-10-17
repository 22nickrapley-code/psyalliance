import pg from "pg";

// Direct staging database and service access for setting up states and
// checking saved outcomes. Staging only: these helpers refuse to run when the
// target is not the local stack.
const LOCAL = /^(127\.0\.0\.1|localhost)$/;

let pool: pg.Pool | null = null;
export function db() {
  if (!pool) pool = new pg.Pool({ host: "127.0.0.1", port: 54322, user: "supabase_admin", database: "postgres", max: 4 });
  return pool;
}

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await db().query(sql, params);
  return rows as T[];
}

export async function one<T = any>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(sql, params);
  if (rows.length !== 1) throw new Error(`expected one row, got ${rows.length}: ${sql}`);
  return rows[0];
}

// Run SQL as a signed-in member through PostgreSQL's role and JWT settings,
// exactly as PostgREST does for the app (RLS applies).
export async function asMember<T = any>(userId: string, sql: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
  const c = await db().connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`, [
      JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
    ]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function runJobs(names: string[]) {
  for (const n of names) {
    const [job] = await q<{ command: string }>(`select command from cron.job where jobname = $1`, [n]);
    if (!job) throw new Error(`no cron job ${n}`);
    await q(job.command);
  }
}

// Mailpit: the only inbox staging email ever reaches.
const MAILPIT = "http://127.0.0.1:8025";
export async function inbox(address: string) {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=50`);
  const body = await r.json();
  return (body.messages || []) as { ID: string; Subject: string; Created: string; Tags: string[] }[];
}
export async function message(id: string) {
  const r = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return (await r.json()) as { Subject: string; Text: string; HTML: string };
}
export async function clearInbox() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

export async function gatewayFault(fault: { path: string; method?: string; status?: number; times?: number; delayMs?: number; pass?: boolean } | { clear: true }) {
  await fetch("http://127.0.0.1:54321/__fault", { method: "POST", body: JSON.stringify(fault) });
}

export async function providerScenario(s: { mode: string; times?: number }) {
  await fetch("http://127.0.0.1:54400/__scenario", { method: "POST", body: JSON.stringify(s) });
}
export async function providerSent() {
  return (await (await fetch("http://127.0.0.1:54400/__sent")).json()) as { id: string; to: string[]; subject: string }[];
}

export function assertLocal(baseURL: string) {
  if (!LOCAL.test(new URL(baseURL).hostname)) throw new Error("staging helpers only run against the local stack");
}
