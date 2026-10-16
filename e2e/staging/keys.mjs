// Prints a fresh, local-only JWT secret plus anon and service keys for the
// disposable staging stack. Output goes to $STAGE/secrets/keys.env, never
// into the repository.
import crypto from "node:crypto";
const secret = crypto.randomBytes(32).toString("hex");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (payload) => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  return `${head}.${body}.${crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
};
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 3600 * 24 * 365 * 5;
console.log(`STAGE_JWT_SECRET=${secret}`);
console.log(`STAGE_ANON_KEY=${sign({ iss: "supabase-staging", role: "anon", iat, exp })}`);
console.log(`STAGE_SERVICE_KEY=${sign({ iss: "supabase-staging", role: "service_role", iat, exp })}`);
