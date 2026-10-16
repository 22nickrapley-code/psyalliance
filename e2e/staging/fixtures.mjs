// Fictional staging fixtures. Creates sign-in accounts through the local Auth
// admin API (local service key) and their PsyAlliance records directly in the
// staging database. Passwords are random per build and kept only in
// $STAGE/secrets/fixtures.json (mode 600); they are never printed or
// committed. Every address is on example domains and every person is
// invented.
//
// Roles covered: four verified New York clinicians (two or three can compete
// for one colleague's request), a verified Massachusetts clinician, a pending member,
// an expired-licence member, a suspended member, an operator/admin, and two
// referring providers (one pending, one approved).
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

const STAGE = process.env.STAGE || "/opt/stage";
const keys = Object.fromEntries(
  fs.readFileSync(`${STAGE}/secrets/keys.env`, "utf8").trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2))
);
const AUTH = "http://127.0.0.1:54321/auth/v1";
const db = new pg.Client({ host: "127.0.0.1", port: 54322, user: "supabase_admin", database: "postgres" });

const DOMAIN = "mail.staging.example";
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => new Date(today.getTime() + n * 86400000);

// Treatment focus ids: 7 anxiety, 16 depression, 41 OCD, 61 trauma.
// Insurance ids: 103 Aetna, 109 Cigna, 130 self-pay. 131 English; 194/195 in person / virtual.
export const PEOPLE = [
  { key: "avery", name: "Avery Quillfeather", prefix: "Dr", q: "PsyD", state: "NY", city: "Brooklyn", verified: true, focus: [7, 16], insurance: [103, 130] },
  { key: "bram", name: "Bram Tellinghast", prefix: "Dr", q: "PhD", state: "NY", city: "Manhattan", verified: true, focus: [7, 41], insurance: [103, 109] },
  { key: "cass", name: "Cass Morrowgate", prefix: "Dr", q: "PsyD", state: "NY", city: "Queens", verified: true, focus: [7, 61], insurance: [103] },
  { key: "fenn", name: "Fenn Oakhollow", prefix: "Dr", q: "PhD", state: "NY", city: "Rochester", verified: true, focus: [7, 16], insurance: [103] },
  { key: "dara", name: "Dara Vennholt", prefix: "Dr", q: "PhD", state: "MA", city: "Boston", verified: true, focus: [16, 61], insurance: [109] },
  { key: "pell", name: "Pell Ardenwick", prefix: "Dr", q: "PsyD", state: "NY", city: "Albany", verified: false, licenceReviewed: false, focus: [7] },
  { key: "esme", name: "Esme Lapsworth", prefix: "Dr", q: "PhD", state: "NY", city: "Buffalo", verified: true, licenceExpiry: -1, focus: [7, 16] },
  { key: "sol", name: "Sol Vancemoor", prefix: "Dr", q: "PsyD", state: "NY", city: "Yonkers", verified: true, accountStatus: "suspended", focus: [7] },
  { key: "otto", name: "Otto Operand", operator: true, admin: true },
  { key: "rhea", name: "Rhea Providence", provider: "pending" },
  { key: "ruben", name: "Ruben Referral", provider: "approved" },
];

async function adminCreateUser(email, password, fullName) {
  const r = await fetch(`${AUTH}/admin/users`, {
    method: "POST",
    headers: { apikey: keys.STAGE_SERVICE_KEY, authorization: `Bearer ${keys.STAGE_SERVICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`create ${email}: ${r.status} ${body.msg || body.message || JSON.stringify(body)}`);
  return body.id;
}

async function main() {
  await db.connect();
  const out = { createdAt: new Date().toISOString(), accounts: {} };
  let adminId = null;
  // The operator first, so licences can name a reviewer.
  const ordered = [...PEOPLE.filter((p) => p.admin), ...PEOPLE.filter((p) => !p.admin)];
  for (const p of ordered) {
    const email = `${p.key}@${DOMAIN}`;
    const password = `St-${crypto.randomBytes(12).toString("base64url")}`;
    const id = await adminCreateUser(email, password, p.name);
    out.accounts[p.key] = { id, email, password, name: p.name };
    if (p.provider) {
      await db.query(
        `insert into referring_providers (id, full_name, practice_name, email, approval_status, reviewed_at)
         values ($1, $2, 'Fictional Family Medicine', $3, $4::text, case when $4::text = 'approved' then now() end)`,
        [id, p.name, email, p.provider]
      );
      continue;
    }
    await db.query(
      `insert into profiles (id, full_name, credential_prefix, qualification_level, primary_state, primary_practice_city,
         states_qualified, verification_status, verified_at, is_admin, account_kind, account_status,
         referral_availability, coverage_availability, consultation_availability, availability_confirmed_at,
         first_availability_confirmed_at, approx_spaces, contact_email, bio, open_to_give_supervision, open_to_receive_supervision)
       values ($1, $2, $3, $4::qualification_level, $5, $6, $7, $8::verification_status, $9, $10, $11, $12,
         'yes', 'yes', 'yes', now(), now(), 3, $13, $14, $15, $16)`,
      [
        id,
        p.name,
        p.operator ? null : p.prefix,
        p.operator ? null : p.q,
        p.state || null,
        p.city || null,
        p.state ? [p.state] : [],
        p.operator || p.verified ? "verified" : "pending",
        p.operator || p.verified ? new Date() : null,
        !!p.admin,
        p.operator ? "operator" : "clinician",
        p.accountStatus || "active",
        email,
        p.operator ? null : `Fictional staging clinician in ${p.city}. Not a real person.`,
        p.key === "bram",
        p.key === "cass",
      ]
    );
    if (p.admin) adminId = id;
    if (p.state) {
      const exp = iso(addDays(p.licenceExpiry ?? 400));
      await db.query(
        `insert into licenses (profile_id, state, license_number, license_type, expiration_date, status, notes, reviewed_at, reviewed_by)
         values ($1, $2, $3, 'Psychologist', $4, 'active', 'Fictional staging licence', $5, $6)`,
        [id, p.state, `STG-${p.key.toUpperCase()}-${crypto.randomInt(100000, 999999)}`, exp, p.licenceReviewed === false ? null : new Date(), p.licenceReviewed === false ? null : adminId]
      );
    }
    for (const [i, v] of (p.focus || []).entries())
      await db.query(`insert into profile_lookup_values (profile_id, lookup_value_id, rank) values ($1, $2, $3)`, [id, v, i + 1]);
    for (const v of [...(p.insurance || []), ...(p.state ? [131, 194, 195] : [])])
      await db.query(`insert into profile_lookup_values (profile_id, lookup_value_id) values ($1, $2) on conflict do nothing`, [id, v]);
  }
  fs.writeFileSync(`${STAGE}/secrets/fixtures.json`, JSON.stringify(out, null, 2), { mode: 0o600 });
  const { rows } = await db.query(
    `select p.full_name, p.verification_status::text vs, p.account_status, private.is_network_member(p.id) as network
       from profiles p order by p.full_name`
  );
  console.log(`fixtures: ${Object.keys(out.accounts).length} accounts`);
  for (const r of rows) console.log(`  ${r.full_name.padEnd(30)} ${r.vs.padEnd(9)} ${r.account_status.padEnd(10)} network=${r.network}`);
  await db.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
