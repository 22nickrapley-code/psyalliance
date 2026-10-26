// Lists every line of src/workspace/engine.ts that differs from the frozen reference app.js,
// so reviewers can audit that the port only touches the data layer. Usage: node scripts/engine-diff.mjs
import { readFileSync } from "node:fs";
const ref = readFileSync("implementation-reference/psyalliance-v13/reference/dist/app.js", "utf8").split("\n");
const eng = readFileSync("src/workspace/engine.ts", "utf8").split("\n");
const refSet = new Set(ref.map((l) => l.trim()));
let changed = 0;
eng.forEach((l, i) => { if (l.trim() && !refSet.has(l.trim())) { changed++; console.log(`${i + 1}: ${l.slice(0, 200)}`); } });
console.error(`${changed} engine lines differ from the reference (of ${eng.length}).`);
