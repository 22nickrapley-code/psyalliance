// Prints a fresh pair of keys for phone (web push) alerts. Run once: node scripts/make-vapid-keys.mjs
// The public key goes in the build as VAPID_PUBLIC_KEY; the private key is a secret (VAPID_PRIVATE_KEY). Never commit either.
import { generateKeyPairSync } from "node:crypto";
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const j = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]).toString("base64url");
console.log(`VAPID_PUBLIC_KEY=${pub}`);
console.log(`VAPID_PRIVATE_KEY=${j.d}`);
