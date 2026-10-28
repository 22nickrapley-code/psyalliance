import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type * as DemoTypes from "../../src/tour/demo-scripts";

// The scripted demos are plain data the site shares with its player
// (src/tour/demo-scripts.ts). The suite reads the very same file, bundled once
// for Node, so a test can never list a demo the site does not have.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(mkdtempSync(path.join(tmpdir(), "pa-demos-")), "demos.cjs");
execFileSync(path.join(root, "node_modules/.bin/esbuild"), [path.join(root, "src/tour/demo-scripts.ts"), "--bundle", "--format=cjs", "--platform=node", `--outfile=${out}`, "--log-level=error", `--alias:@=${path.join(root, "src")}`]);
export const D = createRequire(import.meta.url)(out) as typeof DemoTypes;
