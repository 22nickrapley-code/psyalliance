// Phone alerts: web push (free) and text messages (a paid account key, switched on later).
// The push carries no text. The device is woken, then asks the app for the wording while signed in.

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

async function vapidJwt(audience: string): Promise<string> {
  const pub = unb64u(vapidPublicKey());
  const jwk = { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: process.env.VAPID_PRIVATE_KEY || "" };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = (o: object) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const body = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || "mailto:hello@psyalliance.org" })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(body)));
  return `${body}.${b64u(sig)}`;
}

export type SendResult = { ok: boolean; gone?: boolean; error?: string };

// Phone alerts stay hidden until they have been tested on real phones (PHONE_ALERTS=on switches them on).
export const phoneAlertsOn = () => process.env.PHONE_ALERTS === "on";

// Only the browsers' own push services are accepted (review F04): HTTPS, a known host, no user info, no odd port.
// A local mock endpoint is allowed only when PUSH_TEST_LOCAL=1 (the automated tests), never in production.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
export function validPushEndpoint(raw: string): boolean {
  if (!raw || raw.length > 1000) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.username || u.password) return false;
  if (process.env.PUSH_TEST_LOCAL === "1" && u.protocol === "http:" && u.hostname === "127.0.0.1") return true;
  if (u.protocol !== "https:" || (u.port && u.port !== "443")) return false;
  return PUSH_HOSTS.some((h) => h.test(u.hostname.toLowerCase()));
}
// Browser subscription keys: p256dh is a 65-byte public key, auth a 16-byte secret, both base64url.
export const validPushKeys = (p256dh: string, auth: string) => /^[A-Za-z0-9_-]{86,88}$/.test(p256dh) && /^[A-Za-z0-9_-]{21,24}$/.test(auth);

export async function sendPush(endpoint: string): Promise<SendResult> {
  if (!vapidPublicKey() || !process.env.VAPID_PRIVATE_KEY) return { ok: false, error: "Push is not configured" };
  if (!validPushEndpoint(endpoint)) return { ok: false, gone: true, error: "Not a supported push service" };
  try {
    const jwt = await vapidJwt(new URL(endpoint).origin);
    const res = await fetch(endpoint, { method: "POST", redirect: "manual", headers: { TTL: "3600", Urgency: "normal", "Content-Length": "0", Authorization: `vapid t=${jwt}, k=${vapidPublicKey()}` } });
    if (res.status === 404 || res.status === 410) return { ok: false, gone: true, error: `Subscription gone (${res.status})` };
    return res.ok ? { ok: true } : { ok: false, error: `Push service said ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

// SMS_PROVIDER: "twilio" (real, needs the three TWILIO_* keys), "mock" (posts to SMS_MOCK_URL for testing), or unset (off).
export async function sendSms(to: string, body: string): Promise<SendResult> {
  const provider = process.env.SMS_PROVIDER;
  try {
    if (provider === "mock") {
      const res = await fetch(process.env.SMS_MOCK_URL || "http://127.0.0.1:3602/sms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, body }) });
      return res.ok ? { ok: true } : { ok: false, error: `Mock SMS said ${res.status}` };
    }
    if (provider === "twilio") {
      const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
      if (!sid || !tok || !from) return { ok: false, error: "Twilio keys are missing" };
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${sid}:${tok}`)}`, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      });
      return res.ok ? { ok: true } : { ok: false, error: `Twilio said ${res.status}` };
    }
    return { ok: false, error: "Text alerts are not switched on" };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

export const smsLive = () => process.env.SMS_PROVIDER === "twilio" || process.env.SMS_PROVIDER === "mock";
