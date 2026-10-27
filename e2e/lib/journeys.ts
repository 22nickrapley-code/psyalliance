import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type * as JourneyTypes from "../../src/tour/journeys";

// The demo library is plain data the site shares with its frames (src/tour).
// The suite reads the very same file, bundled once for Node, so a test can
// never list steps the site does not have, or miss one it does.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(mkdtempSync(path.join(tmpdir(), "pa-journeys-")), "journeys.cjs");
execFileSync(path.join(root, "node_modules/.bin/esbuild"), [path.join(root, "src/tour/journeys.ts"), "--bundle", "--format=cjs", "--platform=node", `--outfile=${out}`, "--log-level=error"]);
export const J = createRequire(import.meta.url)(out) as typeof JourneyTypes;
