// Staging stand-ins for the two things that leave the database on the hosted
// projects: pg_net's HTTP worker and the email provider (Resend).
//
// 1. Queue worker: every second, sends each new row in net.http_request_queue
//    and records the answer in net._http_response, as pg_net does. Requests
//    to api.resend.com / api.postmarkapp.com go to the mock below, never to
//    the real provider.
// 2. Provider mock (:54400): accepts POST /emails like Resend, checks the
//    API key and the sender domain, stores the message, and copies it into
//    Mailpit so a test can read the inbox. Scenarios can be injected:
//      POST /__scenario {"mode":"reject"|"ratelimit"|"error"|"timeout"|"ok","times":1}
//      POST /__config   {"apiKey":"...","verifiedDomains":["psyalliance.org"]}
//      GET  /__sent     list what was accepted
import http from "node:http";
import pg from "pg";

const PORT = 54400;
const MAILPIT = "http://127.0.0.1:8025";
const db = new pg.Pool({ host: "127.0.0.1", port: 54322, user: "supabase_admin", database: "postgres", max: 3 });

let config = { apiKey: process.env.STAGE_PROVIDER_KEY || "re_staging_test_key", verifiedDomains: ["psyalliance.org"] };
const scenarios = [];
const sent = [];
let nextId = 1;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";
  for await (const c of req) body += c;
  return body;
}

async function toMailpit(msg) {
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((e) => ({ Email: e }));
  const from = String(msg.from || "");
  const m = from.match(/^(.*)<(.+)>$/);
  await fetch(`${MAILPIT}/api/v1/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      From: m ? { Name: m[1].trim(), Email: m[2].trim() } : { Email: from },
      To: to,
      Subject: msg.subject || "(no subject)",
      HTML: msg.html || undefined,
      Text: msg.text || undefined,
      Tags: ["product-email"],
    }),
  }).catch(() => {});
}

http
  .createServer(async (req, res) => {
    try {
      if (req.url === "/health") return json(res, 200, { ok: true, sent: sent.length, scenarios: scenarios.length });
      if (req.url === "/__sent") return json(res, 200, sent);
      if (req.url === "/__reset" && req.method === "POST") {
        sent.length = 0;
        scenarios.length = 0;
        return json(res, 200, { ok: true });
      }
      if (req.url === "/__scenario" && req.method === "POST") {
        const s = JSON.parse((await readBody(req)) || "{}");
        scenarios.push({ mode: s.mode || "ok", times: s.times ?? 1 });
        return json(res, 200, { scenarios });
      }
      if (req.url === "/__config" && req.method === "POST") {
        config = { ...config, ...JSON.parse((await readBody(req)) || "{}") };
        return json(res, 200, config);
      }
      if (req.url === "/emails" && req.method === "POST") {
        const auth = req.headers.authorization || "";
        const msg = JSON.parse((await readBody(req)) || "{}");
        const sc = scenarios.find((s) => s.times > 0);
        if (sc) sc.times--;
        const mode = sc?.mode || "ok";
        if (mode === "timeout") return; // never answers
        if (mode === "error") return json(res, 500, { name: "internal_server_error", message: "Staging: provider error" });
        if (mode === "ratelimit") return json(res, 429, { name: "rate_limit_exceeded", message: "Staging: too many requests" });
        if (auth !== `Bearer ${config.apiKey}`) return json(res, 401, { name: "validation_error", message: "API key is invalid" });
        const domain = String(msg.from || "").replace(/.*@/, "").replace(/>.*/, "").trim().toLowerCase();
        if (mode === "reject" || !config.verifiedDomains.includes(domain))
          return json(res, 403, { name: "validation_error", message: `The ${domain} domain is not verified.` });
        if (!msg.to || !msg.subject) return json(res, 422, { name: "validation_error", message: "Missing to or subject" });
        const id = `staging-${nextId++}`;
        sent.push({ id, at: new Date().toISOString(), from: msg.from, to: msg.to, subject: msg.subject });
        await toMailpit(msg);
        return json(res, 200, { id });
      }
      json(res, 404, { message: "not found" });
    } catch (e) {
      json(res, 500, { message: String(e) });
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`provider mock on :${PORT}`));

// ---------------------------------------------------------------- pg_net
const PROVIDERS = [/^https:\/\/api\.resend\.com\//, /^https:\/\/api\.postmarkapp\.com\//];
let busy = false;

async function work() {
  if (busy) return;
  busy = true;
  try {
    const { rows } = await db.query(
      `select q.id, q.method, q.url, q.headers, convert_from(q.body, 'UTF8') as body, q.timeout_milliseconds
         from net.http_request_queue q
        where not exists (select 1 from net._http_response r where r.id = q.id)
        order by q.id limit 20`
    );
    for (const r of rows) {
      let status = null, content = null, error = null, timedOut = false;
      const local = PROVIDERS.some((p) => p.test(r.url)) ? `http://127.0.0.1:${PORT}/${r.url.replace(/^https:\/\/[^/]+\//, "")}` : null;
      if (!local) {
        error = "Staging: outbound HTTP is disabled";
      } else {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), r.timeout_milliseconds || 5000);
        try {
          const resp = await fetch(local, { method: r.method, headers: r.headers || {}, body: r.body ?? undefined, signal: ctl.signal });
          status = resp.status;
          content = await resp.text();
        } catch (e) {
          timedOut = e.name === "AbortError";
          error = timedOut ? `Timeout of ${r.timeout_milliseconds} ms reached` : String(e);
        } finally {
          clearTimeout(t);
        }
      }
      await db.query(
        `insert into net._http_response (id, status_code, content_type, content, timed_out, error_msg) values ($1, $2, 'application/json', $3, $4, $5)
         on conflict (id) do nothing`,
        [r.id, status, content, timedOut, error]
      );
      await db.query(`delete from net.http_request_queue where id = $1`, [r.id]);
    }
  } catch (e) {
    if (!/does not exist|ECONNREFUSED/.test(String(e))) console.error("net worker:", e.message);
  } finally {
    busy = false;
  }
}
setInterval(work, 1000);
