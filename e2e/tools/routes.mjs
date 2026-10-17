// Re-enumerates the app's routes from a production build, so the register
// always covers every page and route handler the build actually defines.
//   node tools/routes.mjs /path/to/app/.next > register/routes.json
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || path.join(process.cwd(), "..", ".next");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "app-path-routes-manifest.json"), "utf8"));
const pages = Object.entries(manifest).filter(([k]) => k.endsWith("/page")).map(([, v]) => v).sort();
const handlers = Object.entries(manifest).filter(([k]) => k.endsWith("/route")).map(([, v]) => v).sort();
let build = "";
try {
  build = fs.readFileSync(path.join(dir, "BUILD_ID"), "utf8").trim();
} catch {}
process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), build, definitions: pages.length + handlers.length, pages, handlers }, null, 2) + "\n");
