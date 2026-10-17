import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { signInAs, account, memberClient } from "../../lib/auth";
import { watch, sanitise } from "../../lib/evidence";
import { q, assertLocal } from "../../lib/staging";
import { coverPlan, referral } from "../../lib/scenarios";

// Route sweep: every page the app defines, opened as each kind of member.
// Test IDs are "RT <route> @<role>" and stay stable as long as the route
// exists; the register builder (tools/build-register.mjs) reads them.
//
// For every route and role: no server error, no error screen, no uncaught
// script error. Beyond that, the expectation depends on who is looking:
//   anon     dashboard pages send you to sign in; public pages open
//   members  admin pages send you back to Home
//   provider dashboard pages send a referring provider to their portal
// What each page then shows is covered by the journey tests.

const ROUTES: string[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "register/routes.json"), "utf8")).pages;
const ROLES = (process.env.ROUTE_ROLES || "anon,pell,avery,ruben,sol,esme").split(",");
const ERROR_TEXT = /Something went wrong|The page didn.t load completely|hit a snag|Application error|Internal Server Error/i;

type Ids = Record<string, string>;
let ids: Ids | null = null;

async function fixtures(): Promise<Ids> {
  if (ids) return ids;
  const avery = await memberClient("avery");
  const { data: c } = await avery
    .from("consultations")
    .insert({ author_profile_id: account("avery").id, question: `QA route sweep ${Date.now()}: a fictional question.`, status: "open", audience_type: "selected", audience_profile_ids: [account("bram").id], deidentification_confirmed: true })
    .select("id")
    .single();
  const plan = await coverPlan("avery", ["bram"], ["Client R"]);
  const ref = await referral("avery", ["bram"]);
  let conv = (await q(`select cp.conversation_id from conversation_participants cp where cp.profile_id = $1 limit 1`, [account("avery").id]))[0]?.conversation_id;
  if (!conv) {
    const { data: cv } = await avery.from("conversations").insert({ created_by: account("avery").id, title: "QA route sweep" }).select("id").single();
    await avery.from("conversation_participants").insert([account("avery").id, account("bram").id].map((profile_id) => ({ conversation_id: cv!.id, profile_id })));
    conv = cv!.id;
  }
  const group = (await q(`select id from consultation_groups limit 1`))[0]?.id;
  ids = {
    "/dashboard/consult/[id]": `/dashboard/consult/${c?.id}`,
    "/dashboard/cover/[id]": `/dashboard/cover/${plan.planId}`,
    "/dashboard/refer/[id]": `/dashboard/refer/${ref}`,
    "/dashboard/messages/[conversationId]": `/dashboard/messages/${conv}`,
    "/dashboard/people/[id]": `/dashboard/people/${account("bram").id}`,
    "/dashboard/continuity/view/[owner]": `/dashboard/continuity/view/${account("bram").id}`,
    "/dashboard/consult/groups/[id]": `/dashboard/consult/groups/${group ?? 999999}`,
    "/dashboard/documents/[code]": "/dashboard/documents/PA-01",
    "/library/[slug]": "/library/reciprocal-coverage-agreement",
    "/full/[slug]": "/full/reciprocal-coverage-agreement",
    "/tour/[demo]": "/tour/cover",
    "/tour/[demo]/[step]": "/tour/cover/plan",
    "/tour/[demo]/done": "/tour/cover/done",
    "/tour/[demo]/watch": "/tour/cover/watch",
    // Links that carry a token: an unknown token must get a clear answer.
    "/availability-check/[token]": "/availability-check/qa-unknown-token",
    "/i/[token]": "/i/qa-unknown-token",
    "/sandbox/[token]": "/sandbox/qa-unknown-token",
    "/dev/preview/[screen]": "/dev/preview/home",
    "/_not-found": "/qa-no-such-page",
  };
  return ids;
}

function expectation(route: string, role: string): { to?: RegExp; status?: number; notFound?: boolean } {
  const dash = route.startsWith("/dashboard");
  if (route === "/_not-found") return { status: 404 };
  if (route === "/dev/preview/[screen]") return { status: 404 }; // production build
  if (route === "/full/[slug]") return { status: 404 }; // retired with "When you're full" (10 Oct)
  // Sandbox pages belong to the demo site; on the real site they don't exist.
  if (route === "/sandbox/[token]") return { status: 404 };
  if (route === "/dashboard/admin/sandbox" && role !== "anon" && role !== "ruben") return { notFound: true };
  if (role === "anon" && dash) return { to: /\/auth\/sign-in/ };
  if (role === "anon" && /^\/refer\/(onboarding|pending|referrals|rejected)/.test(route)) return { to: /\/auth\/(refer-)?sign-in|\/refer$/ };
  if (dash && route.startsWith("/dashboard/admin")) return role === "anon" ? { to: /\/auth\/sign-in/ } : { to: /\/dashboard($|\?|\/(?!admin))|\/refer/ };
  if (role === "ruben" && dash) return { to: /\/refer/ };
  return {};
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
}

test.describe.configure({ mode: "parallel" });
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

for (const role of ROLES)
  for (const route of ROUTES)
    test(`RT ${route} @${role}`, async ({ page, context, baseURL }, info) => {
      const ev = watch(page);
      if (role !== "anon") await signInAs(context, role, baseURL!);
      const f = await fixtures();
      const url = f[route] || route;
      const res = await page.goto(url);
      await settle(page);
      const status = res?.status() ?? 0;
      const text = await page.locator("body").innerText().catch(() => "");
      const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
      const exp = expectation(route, role);
      const outcome = { url, finalPath: sanitise(finalPath), status, errorScreen: ERROR_TEXT.test(text), pageErrors: ev.pageErrors.length, consoleErrors: ev.console.filter((c) => c.startsWith("error")).length };
      await info.attach("outcome.json", { body: JSON.stringify(outcome, null, 2), contentType: "application/json" });
      if (ev.pageErrors.length || ev.console.length) await info.attach("console.txt", { body: [...ev.pageErrors, ...ev.console].join("\n"), contentType: "text/plain" });
      expect.soft(status, "no server error").toBeLessThan(500);
      expect.soft(outcome.errorScreen, "no error screen").toBe(false);
      expect.soft(ev.pageErrors, "no uncaught script errors").toEqual([]);
      if (exp.status) expect(status).toBe(exp.status);
      else if (exp.notFound) expect(text, "shows the not-found page, nothing else").toMatch(/Page not found/);
      else if (exp.to) expect(finalPath).toMatch(exp.to);
      else expect(status, "opens").toBeLessThan(400);
    });
