// A tiny stand-in for the Supabase API gateway: one origin on :54321 with
// /auth/v1, /rest/v1 and /storage/v1 routed to the local services, CORS
// answered the way the hosted gateway answers it. Requests can be failed on
// purpose for failure-injection tests: POST /__fault {"path": "/rest/v1/coverage_requests", "status": 503, "times": 1}
import http from "node:http";

const ROUTES = [
  ["/auth/v1", 9999],
  ["/rest/v1", 3001],
  ["/storage/v1", 5000],
];
const faults = [];
const stats = { requests: 0, faults: 0 };
// Requests still open, for diagnosing a hung page (GET /__inflight).
const inflight = new Map();
let seq = 0;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "access-control-allow-headers": "authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-upsert,cache-control,x-supabase-api-version,accept",
  "access-control-expose-headers": "content-range,range,x-total-count",
  "access-control-max-age": "3600",
};

http
  .createServer((req, res) => {
    if (req.url === "/__fault" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const f = JSON.parse(body || "{}");
          if (f.clear) faults.length = 0;
          else faults.push({ path: f.path, method: f.method || null, status: f.status || 503, times: f.times ?? 1, delayMs: f.delayMs || 0 });
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ faults }));
        } catch (e) {
          res.writeHead(400).end(String(e));
        }
      });
      return;
    }
    if (req.url === "/__stats") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(stats));
    if (req.url === "/__inflight")
      return res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify([...inflight.values()].map((r) => ({ ...r, ageMs: Date.now() - r.at }))));
    if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
    const route = ROUTES.find(([p]) => req.url.startsWith(p + "/") || req.url === p);
    if (!route) return res.writeHead(404, cors).end("no route");
    stats.requests++;
    const id = ++seq;
    inflight.set(id, { method: req.method, url: req.url.replace(/([?&](token|code|access_token|refresh_token)=)[^&]+/g, "$1<redacted>").slice(0, 160), at: Date.now(), phase: "sent" });
    res.on("close", () => inflight.delete(id));
    const path = req.url.slice(route[0].length) || "/";
    const fault = faults.find((f) => f.times > 0 && req.url.startsWith(f.path) && (!f.method || f.method === req.method));
    if (fault) {
      fault.times--;
      stats.faults++;
      const fail = () => res.writeHead(fault.status, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ message: "Injected failure (staging)", code: "STAGING_FAULT" }));
      return fault.delayMs ? setTimeout(fail, fault.delayMs) : fail();
    }
    const upstream = http.request(
      { host: "127.0.0.1", port: route[1], method: req.method, path, headers: { ...req.headers, host: `127.0.0.1:${route[1]}`, "x-forwarded-host": "127.0.0.1:54321", "x-forwarded-proto": "http", "x-forwarded-prefix": route[0] } },
      (up) => {
        const r = inflight.get(id);
        if (r) r.phase = `upstream ${up.statusCode}`;
        const headers = { ...up.headers, ...cors };
        // Auth's redirects point at the public gateway address.
        if (headers.location && headers.location.startsWith("/")) headers.location = route[0] + headers.location;
        res.writeHead(up.statusCode || 502, headers);
        up.pipe(res);
      }
    );
    upstream.on("error", (e) => {
      if (!res.headersSent) res.writeHead(502, cors);
      res.end(JSON.stringify({ message: `gateway: ${e.message}` }));
    });
    req.pipe(upstream);
  })
  .listen(54321, "127.0.0.1", () => console.log("gateway on :54321"));
