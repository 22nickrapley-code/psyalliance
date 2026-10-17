// Builds the acceptance register from the catalogue, the route list and the
// results of one or more runs (later runs override earlier ones for the same
// test). Writes register/register.csv, register/register.md and
// register/summary.json.
//   node tools/build-register.mjs reports/candidate-a reports/candidate-b ...
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runs = process.argv.slice(2);
const catalogue = JSON.parse(fs.readFileSync(path.join(root, "register/catalogue.json"), "utf8"));
const routes = JSON.parse(fs.readFileSync(path.join(root, "register/routes.json"), "utf8"));

// title -> { status, run, error, project }
const results = new Map();
for (const run of runs) {
  const file = path.join(root, run, "results.json");
  if (!fs.existsSync(file)) {
    console.error(`no results in ${run}`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const walk = (s, file) => {
    for (const sp of s.specs || []) {
      for (const t of sp.tests || []) {
        const last = (t.results || []).at(-1);
        if (!last) continue;
        const status = t.status === "flaky" ? "flaky" : last.status; // passed | failed | timedOut | skipped
        const error = (last.errors?.[0]?.message || "").replace(/\u001b\[[0-9;]*m/g, "").split("\n")[0].slice(0, 200);
        results.set(`${t.projectName}|${sp.title}`, { title: sp.title, status, run: path.basename(run), error, project: t.projectName });
      }
    }
    for (const c of s.suites || []) walk(c, file);
  };
  for (const s of data.suites || []) walk(s);
}

const all = [...results.values()];
const matchTests = (prefixes) => all.filter((r) => prefixes.some((p) => r.title === p || r.title.startsWith(p + " ") || (p.endsWith("-") && r.title.startsWith(p))));

function verdict(found) {
  if (!found.length) return "Not run";
  if (found.some((r) => r.status === "failed" || r.status === "timedOut")) return "Fail";
  if (found.some((r) => r.status === "flaky")) return "Pass (flaky)";
  if (found.every((r) => r.status === "skipped")) return "Skipped";
  return "Pass";
}

const rows = [];
for (const it of catalogue.items) {
  const found = it.tests.length ? matchTests(it.tests) : [];
  const status = it.tests.length ? verdict(found) : it.status || "Not automated";
  const failing = found.filter((r) => r.status !== "passed" && r.status !== "skipped");
  rows.push({
    id: it.id,
    area: it.area,
    item: it.title,
    source: it.source,
    status,
    tests: found.length ? `${found.filter((r) => r.status === "passed").length}/${found.length} passed` : "",
    evidence: [...new Set(found.map((r) => r.run))].join(" "),
    notes: [it.notes || "", ...failing.map((r) => `${r.title.split(" ")[0]}: ${r.error}`)].filter(Boolean).join(" | "),
  });
}

// One row per page, across every role it was opened as.
const roleOf = (t) => (t.match(/ @(\w+)$/) || [])[1];
routes.pages.forEach((route, n) => {
  const found = all.filter((r) => r.title.startsWith(`RT ${route} @`));
  const failing = found.filter((r) => r.status !== "passed");
  rows.push({
    id: `RT-${String(n + 1).padStart(3, "0")}`,
    area: "Routes",
    item: `${route} opens correctly for each role (${[...new Set(found.map((r) => roleOf(r.title)))].join(", ") || "not run"})`,
    source: "Route inventory",
    status: verdict(found),
    tests: found.length ? `${found.length - failing.length}/${found.length} passed` : "",
    evidence: [...new Set(found.map((r) => r.run))].join(" "),
    notes: failing.map((r) => `@${roleOf(r.title)}: ${/uncaught script errors/.test(r.error) ? "React hydration error (HYD-01)" : r.error}`).join(" | "),
  });
});
routes.handlers.forEach((route, n) => {
  rows.push({ id: `RH-${String(n + 1).padStart(2, "0")}`, area: "Route handlers", item: route, source: "Route inventory", status: "Covered by journeys", tests: "", evidence: "", notes: "" });
});

const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
const testCounts = all.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
fs.writeFileSync(
  path.join(root, "register/summary.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), runs: runs.map((r) => path.basename(r)), routeDefinitions: routes.definitions, pages: routes.pages.length, handlers: routes.handlers.length, items: rows.length, itemStatus: counts, tests: all.length, testStatus: testCounts }, null, 2) + "\n"
);
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const cols = ["id", "area", "item", "source", "status", "tests", "evidence", "notes"];
fs.writeFileSync(path.join(root, "register/register.csv"), [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n");
const md = [
  "# Acceptance register",
  "",
  `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC from: ${runs.map((r) => path.basename(r)).join(", ")}.`,
  `${routes.definitions} route definitions (${routes.pages.length} pages, ${routes.handlers.length} handlers). ${all.length} test results.`,
  "",
  `Items by status: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
  "",
  "| ID | Area | Item | Status | Tests | Notes |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${r.area} | ${r.item.replace(/\|/g, "/")} | ${r.status} | ${r.tests} | ${(r.notes || "").replace(/\|/g, "/").slice(0, 300)} |`),
  "",
].join("\n");
fs.writeFileSync(path.join(root, "register/register.md"), md);
console.log(JSON.stringify({ items: rows.length, counts, tests: all.length, testCounts }, null, 2));
