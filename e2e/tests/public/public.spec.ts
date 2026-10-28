import { test, expect } from "@playwright/test";
import { watch, attachEvidence, shot } from "../../lib/evidence";

// Public pages, signed out. Read-only: safe to run against the live sites
// (npm run test:public:live / test:public:sandbox) and against staging.
const isSandbox = () => /sandbox\./.test(test.info().project.use.baseURL || process.env.E2E_BASE_URL || "");

test("PUB-01 the homepage loads with its main calls to action", async ({ page }, info) => {
  const ev = watch(page);
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(400);
  await shot(page, info, "home");
  await expect(page.getByRole("link", { name: /Sign in/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Join|Create your account/ }).first()).toBeVisible();
  await attachEvidence(info, ev);
  expect(ev.pageErrors, "no script errors").toEqual([]);
});

test("PUB-02 sign-in, sign-up and reset forms are there", async ({ page }, info) => {
  for (const [path, field] of [["/auth/sign-in", 'input[name="password"]'], ["/auth/sign-up", 'input[name="password_confirm"]'], ["/auth/forgot-password", 'input[name="email"]']] as const) {
    if (isSandbox() && path !== "/auth/sign-in") continue;
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.locator(field).first(), path).toBeVisible();
    await shot(page, info, path.replace(/\//g, "_"));
  }
});

test("PUB-03 the Library lists templates and never calls a provisional one reviewed", async ({ page }, info) => {
  test.skip(isSandbox(), "the Library lives on the main site");
  await page.goto("/library");
  await shot(page, info, "library");
  const links = page.locator('a[href^="/library/"]');
  expect(await links.count()).toBeGreaterThan(0);
  const href = await links.first().getAttribute("href");
  await page.goto(href!);
  await shot(page, info, "template");
  const text = await page.locator("body").innerText();
  const reviewed = /Reviewed by/i.test(text);
  const provisional = /not yet reviewed|provisional|in review|being reviewed|awaiting review/i.test(text);
  await info.attach("labels.json", { body: JSON.stringify({ href, reviewed, provisional }), contentType: "application/json" });
  expect(reviewed && provisional, "a page can't say both").toBe(false);
});

test("PUB-04 the demos open and the player starts", async ({ page }, info) => {
  await page.goto("/tour");
  await shot(page, info, "tour");
  await page.goto("/tour/cover/watch");
  await expect(page.locator(".dp").first()).toBeVisible();
  await shot(page, info, "player");
});

test("PUB-05 an unknown page says so", async ({ page }) => {
  const res = await page.goto("/qa-no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByText(/not found/i).first()).toBeVisible();
});

test("PUB-06 security headers are sent", async ({ request }, info) => {
  const res = await request.get("/");
  const h = res.headers();
  await info.attach("headers.json", { body: JSON.stringify(h, null, 2), contentType: "application/json" });
  expect(h["strict-transport-security"]).toBeTruthy();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"] || "").toMatch(/frame-ancestors/);
});

test("PUB-07 signed out, member pages ask you to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in|\/sandbox\/ended/);
});
