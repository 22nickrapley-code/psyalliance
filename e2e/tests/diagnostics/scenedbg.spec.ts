import { test } from "@playwright/test";
import { J } from "../../lib/journeys";
const { JOURNEYS, sceneSrc } = J;
test("scenedbg", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await context.newPage();
  for (const j of JOURNEYS) for (const s of j.steps) {
    const id = `${j.key}/${s.slug}`;
    if (!["overview/control", "cover/review"].includes(id)) continue;
    const src = sceneSrc(j.key, s.slug, s.scene);
    await page.goto(src);
    await page.waitForFunction(() => ["ready", "error"].includes(document.documentElement.dataset.scene || ""), null, { timeout: 30000 });
    console.log("SCENE " + id + " " + src + " => " + (await page.evaluate(() => document.documentElement.dataset.scene + " | " + (document.documentElement.dataset.sceneError || ""))));
    console.log("MACRO " + JSON.stringify(s.scene));
  }
  await context.close();
});
