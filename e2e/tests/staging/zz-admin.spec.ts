import { test, expect } from "@playwright/test";
import { signInAs, account, memberClient, disposableMember } from "../../lib/auth";
import { shot } from "../../lib/evidence";
import { q, one, assertLocal } from "../../lib/staging";

// Admin, tested last (the file name sorts it last). Server actions can be
// called by any signed-in session that knows their ID, so the database is
// the real gate: first every admin change is tried as an ordinary verified
// member and must be refused there; then the operator account uses the
// admin screens.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

test.describe("ADM-SEC the database refuses admin changes from members", () => {
  const avery = () => memberClient("avery");

  test("ADM-SEC-01 a member can't make themselves an admin, verify themselves or change their account status", async ({}, info) => {
    const c = await avery();
    const id = account("avery").id;
    const before = await one(`select is_admin, verification_status::text v, account_status::text s from profiles where id = $1`, [id]);
    const r1 = await c.from("profiles").update({ is_admin: true }).eq("id", id).select("id");
    const r2 = await c.from("profiles").update({ verification_status: "verified" }).eq("id", account("pell").id).select("id");
    const r3 = await c.from("profiles").update({ account_status: "suspended" }).eq("id", account("bram").id).select("id");
    const after = await one(`select is_admin, verification_status::text v, account_status::text s from profiles where id = $1`, [id]);
    const pell = await one(`select verification_status::text v from profiles where id = $1`, [account("pell").id]);
    const bram = await one(`select account_status::text s from profiles where id = $1`, [account("bram").id]);
    await info.attach("outcome.json", { body: JSON.stringify({ r1: r1.error?.message ?? r1.data, r2: r2.error?.message ?? r2.data, r3: r3.error?.message ?? r3.data, before, after, pell, bram }, null, 2), contentType: "application/json" });
    expect(after.is_admin).toBe(false);
    expect(pell.v).not.toBe("verified");
    expect(bram.s).toBe("active");
  });

  test("ADM-SEC-02 a member can't review a license (their own or another's)", async ({}, info) => {
    const m = await disposableMember("lic");
    const { data: lic, error } = await m.client.from("licenses").insert({ profile_id: m.id, state: "NY", license_number: `QA${Date.now()}`, license_type: "Psychologist" }).select("id").single();
    const own = lic ? await m.client.from("licenses").update({ reviewed_at: new Date().toISOString(), reviewed_by: m.id }).eq("id", lic.id).select("id") : null;
    const other = lic ? await (await avery()).from("licenses").update({ reviewed_at: new Date().toISOString() }).eq("id", lic.id).select("id") : null;
    const row = lic ? await one(`select reviewed_at from licenses where id = $1`, [lic.id]) : null;
    await info.attach("outcome.json", { body: JSON.stringify({ insert: error?.message ?? null, own: own?.error?.message ?? own?.data, other: other?.error?.message ?? other?.data, row }, null, 2), contentType: "application/json" });
    expect(row?.reviewed_at ?? null).toBeNull();
  });

  for (const [name, args] of [
    ["admin_set_state_open", { p_state: "TX", p_open: true }],
    ["admin_redact", { p_target_type: "message", p_target_id: "1", p_reason: "QA" }],
    ["admin_set_library_public", { p_document: 1, p_listed: true, p_download: true, p_contents: [] }],
    ["admin_members", {}],
    ["admin_library_leads", {}],
    ["admin_set_library_file", { p_document: 1, p_path: "shared/x.pdf", p_version: 9 }],
    ["admin_profiles", {}],
    ["admin_network_metrics", {}],
    ["admin_email_health", {}],
    ["admin_orphaned_files", {}],
    ["admin_activation", { p_weeks: 4 }],
    ["admin_reported_content", { p_report_id: 1 }],
    ["admin_states", {}],
  ] as [string, Record<string, unknown>][])
    test(`ADM-SEC-RPC ${name} is refused for a member`, async ({}, info) => {
      const c = await avery();
      const { data, error } = await c.rpc(name, args);
      const empty = data == null || (Array.isArray(data) && data.length === 0) || (typeof data === "object" && Object.keys(data).length === 0);
      await info.attach("outcome.json", { body: JSON.stringify({ error: error?.message ?? null, code: error?.code ?? null, empty, rows: Array.isArray(data) ? data.length : data }), contentType: "application/json" });
      // The function exists with these arguments (not "function not found")...
      expect(error?.code, "the function exists with these arguments").not.toBe("PGRST202");
      // ...and a member gets an error, or nothing at all.
      expect(error !== null || empty, `${name}: refused or empty for a member`).toBe(true);
    });

  test("ADM-SEC-03 a member can't publish a Library document or change its review state", async ({}, info) => {
    const doc = await one(`select id, review_status from documents where library_code = 'PA-01' and owner_scope = 'world'`);
    const c = await avery();
    await c.from("documents").update({ review_status: "published", review_date: new Date().toISOString().slice(0, 10) }).eq("id", doc.id);
    await c.from("documents").update({ public_download: true }).eq("id", doc.id);
    const after = await one(`select review_status, public_download from documents where id = $1`, [doc.id]);
    await info.attach("outcome.json", { body: JSON.stringify({ before: doc, after }), contentType: "application/json" });
    expect(after.review_status).toBe(doc.review_status);
    expect(after.public_download).toBe(false);
  });

  test("ADM-SEC-04 a member can't appoint reviewers, handle join requests, invitations or sandbox passes", async ({}, info) => {
    const c = await avery();
    const res: Record<string, string | null> = {};
    res.reviewers = (await c.from("library_reviewers").insert({ profile_id: account("avery").id, role: "psychologist", appointed_by: account("avery").id, active: true }).select("id")).error?.message ?? "allowed";
    res.passes = (await c.from("sandbox_passes").insert({ label: "QA", token: `qa-${Date.now()}`, created_by: account("avery").id }).select("id")).error?.message ?? "allowed";
    res.joinRequests = JSON.stringify((await c.from("join_requests").update({ status: "declined" }).neq("id", 0).select("id")).data ?? []);
    res.invitations = JSON.stringify((await c.from("cohort_invitations").update({ revoked_at: new Date().toISOString() }).neq("id", 0).select("id")).data ?? []);
    await info.attach("outcome.json", { body: JSON.stringify(res, null, 2), contentType: "application/json" });
    expect(res.reviewers).not.toBe("allowed");
    expect(res.passes).not.toBe("allowed");
    expect(res.joinRequests).toBe("[]");
    expect(res.invitations).toBe("[]");
  });

  test("ADM-SEC-05 a member can't upload into the shared Library folder", async () => {
    const c = await avery();
    const { error } = await c.storage.from("documents").upload(`shared/${account("avery").id}/qa-${Date.now()}.pdf`, new Blob(["%PDF fictional"], { type: "application/pdf" }), { contentType: "application/pdf" });
    expect(error, "refused").not.toBeNull();
  });
});

test.describe("ADM-UI the operator's screens", () => {
  test("ADM-UI-01 every admin page opens for the operator", async ({ page, context, baseURL }, info) => {
    await signInAs(context, "otto", baseURL!);
    const bad: string[] = [];
    for (const p of ["/dashboard/admin", "/dashboard/admin/verifications", "/dashboard/admin/members", "/dashboard/admin/states", "/dashboard/admin/library", "/dashboard/admin/library-leads", "/dashboard/admin/moderation", "/dashboard/admin/invitations", "/dashboard/admin/network-health", "/dashboard/admin/activation", "/dashboard/admin/channel-requests", "/dashboard/admin/insurance-requests", "/dashboard/admin/referring-providers"]) {
      const res = await page.goto(p);
      await page.waitForLoadState("networkidle");
      const text = await page.locator("body").innerText();
      if ((res?.status() ?? 0) >= 400 || /Something went wrong|didn.t load completely/i.test(text) || !page.url().includes("/dashboard/admin")) bad.push(`${p} ${res?.status()} ${page.url()}`);
      await shot(page, info, p.replace(/\//g, "_"));
    }
    expect(bad).toEqual([]);
  });

  test("ADM-UI-02 the operator reviews a new member's license and verifies them; the member sees it", async ({ page, context, baseURL }, info) => {
    const m = await disposableMember("verify");
    // A new applicant's profile, as their first profile save creates it.
    await q(
      `insert into profiles (id, full_name, credential_prefix, qualification_level, primary_state, primary_practice_city, states_qualified, verification_status, account_kind, account_status, contact_email)
       values ($1, 'Quinn Staging-Applicant', 'Dr', 'PhD'::qualification_level, 'NY', 'Albany', array['NY'], 'pending'::verification_status, 'clinician', 'active', $2)`,
      [m.id, m.email]
    );
    const { data: lic, error } = await m.client.from("licenses").insert({ profile_id: m.id, state: "NY", license_number: `QA${Date.now()}`, license_type: "Psychologist" }).select("id").single();
    expect(error, error?.message).toBeNull();
    await signInAs(context, "otto", baseURL!);
    await page.goto("/dashboard/admin/verifications");
    const row = page.locator("form", { has: page.locator(`input[name="id"][value="${lic!.id}"]`) }).first();
    await shot(page, info, "1-queue");
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Mark reviewed" }).click();
    await page.waitForLoadState("networkidle");
    await shot(page, info, "2-reviewed");
    const after = await one(`select reviewed_at is not null as ok, reviewed_by from licenses where id = $1`, [lic!.id]);
    expect(after.ok).toBe(true);
    expect(after.reviewed_by).toBe(account("otto").id);
  });

  test("ADM-UI-03 opening a state for sign-ups and closing it again", async ({ page, context, baseURL }, info) => {
    await q(`delete from open_states where state = 'CT'`);
    const before = (await q(`select state from open_states where open order by 1`)).map((r: any) => r.state);
    await signInAs(context, "otto", baseURL!);
    await page.goto("/dashboard/admin/states");
    const openForm = page.locator("form", { has: page.locator('input[name="open"][value="1"]') }).filter({ has: page.locator('select[name="state"]') }).first();
    await openForm.locator('select[name="state"]').selectOption("CT");
    await openForm.getByRole("button").first().click();
    await page.waitForLoadState("networkidle");
    await shot(page, info, "1-opened");
    const opened = (await q(`select state from open_states where open order by 1`)).map((r: any) => r.state);
    const row = page.locator("form", { has: page.locator('input[name="state"][value="CT"]') }).first();
    await row.getByRole("button", { name: "Close" }).click();
    await page.waitForLoadState("networkidle");
    await shot(page, info, "2-closed");
    const closed = (await q(`select state from open_states where open order by 1`)).map((r: any) => r.state);
    await info.attach("outcome.json", { body: JSON.stringify({ before, opened, closed }), contentType: "application/json" });
    expect(opened).toContain("CT");
    expect(closed).toEqual(before);
  });

  test("ADM-UI-04 a provisional Library document can't be published without its reviews", async ({ page, context, baseURL }, info) => {
    const doc = await one(`select id from documents where library_code = 'PA-03' and owner_scope = 'world'`);
    const otto = await memberClient("otto");
    const { error } = await otto.from("documents").update({ review_status: "published", review_date: new Date().toISOString().slice(0, 10) }).eq("id", doc.id);
    const after = await one(`select review_status from documents where id = $1`, [doc.id]);
    await info.attach("outcome.json", { body: JSON.stringify({ error: error?.message ?? null, after }), contentType: "application/json" });
    expect(after.review_status, "still provisional").toBe("provisional");
    await signInAs(context, "otto", baseURL!);
    await page.goto("/dashboard/admin/library");
    await shot(page, info, "library-admin");
  });
});
