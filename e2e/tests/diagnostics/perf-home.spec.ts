import { test } from "@playwright/test";
import { signInAs } from "../../lib/auth";
import { assertLocal, gatewayFault } from "../../lib/staging";

// PERF-01 diagnostic: how long a dashboard page takes to arrive in full
// when every database, sign-in and storage call is slowed by DELAY_MS.
// Run once against each build (E2E_BASE_URL) to compare.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
const PAGES = (process.env.PAGES || "/dashboard,/dashboard/cover,/dashboard/messages").split(",");
const DELAY = Number(process.env.DELAY_MS || 1000);

test(`page timing with ${DELAY} ms per call`, async ({ page, context, baseURL }, info) => {
  test.setTimeout(15 * 60_000);
  await signInAs(context, process.env.ROLE || "avery", baseURL!);
  // Warm each page once without delay.
  for (const p of PAGES) await page.goto(p);
  await gatewayFault({ clear: true });
  for (const prefix of ["/rest/v1", "/auth/v1", "/storage/v1"]) await gatewayFault({ path: prefix, delayMs: DELAY, pass: true, times: 100000 });
  const rows: string[] = [];
  try {
    for (const p of PAGES) {
      const times: number[] = [];
      for (let i = 0; i < Number(process.env.N || 3); i++) {
        const t0 = Date.now();
        const resp = await page.goto(p, { timeout: 120_000 });
        await resp?.finished();
        times.push(Date.now() - t0);
      }
      times.sort((a, b) => a - b);
      rows.push(`${p}: median ${(times[Math.floor(times.length / 2)] / 1000).toFixed(1)} s (${times.map((t) => (t / 1000).toFixed(1)).join(", ")})`);
    }
  } finally {
    await gatewayFault({ clear: true });
  }
  console.log(`${baseURL}, ${DELAY} ms per call:\n  ${rows.join("\n  ")}`);
  await info.attach("timing.txt", { body: rows.join("\n"), contentType: "text/plain" });
});
