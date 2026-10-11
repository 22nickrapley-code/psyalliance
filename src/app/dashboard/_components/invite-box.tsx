"use client";

import { useEffect, useMemo, useState } from "react";
import type { InviteInfo } from "@/lib/invite";

// "Know someone who should be here?" Type an email address, a mobile
// number or a LinkedIn profile, and send the invitation from your own
// email, text messages, WhatsApp or LinkedIn. On a phone, Share opens the
// phone's own list of apps (iMessage, WhatsApp and the rest). Nothing is
// sent by PsyAlliance and nothing typed here is stored.

type Kind = "email" | "phone" | "linkedin" | null;

function detect(raw: string): { kind: Kind; value: string } {
  const t = raw.trim();
  if (!t) return { kind: null, value: "" };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { kind: "email", value: t };
  if (/linkedin\.com\/in\/[^\s/]+/i.test(t)) {
    const url = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
    return { kind: "linkedin", value: url };
  }
  if (/^[\d\s()+.\-]+$/.test(t)) {
    const digits = t.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      // A 10-digit number is taken as US; anything else keeps its own code.
      const intl = t.startsWith("+") ? digits : digits.length === 10 ? `1${digits}` : digits;
      return { kind: "phone", value: intl };
    }
  }
  return { kind: null, value: "" };
}

function buildMessage(info: InviteInfo, name: string) {
  const hi = name.trim() ? `Hi ${name.trim().split(/\s+/)[0]},` : "Hi,";
  const what =
    info.mode === "sandbox"
      ? "I've been trying PsyAlliance, a private network for doctoral psychologists and psychiatrists in private practice: cover when you're away, referrals that fit, and trusted colleagues to ask."
      : "I'm on PsyAlliance, a private network for doctoral psychologists and psychiatrists in private practice: cover when you're away, referrals that fit, and trusted colleagues to ask.";
  const ask =
    info.mode === "member"
      ? "I'd like you as one of my trusted colleagues there. Join through my link and we're connected once you're verified. Founding members never pay."
      : "Have a look. Founding members never pay.";
  const sign = info.mode !== "sandbox" && info.firstName ? `\n\n${info.firstName}` : "";
  return { body: `${hi} ${what} ${ask}`, sign };
}

export function InviteBox({
  info,
  title = "Know someone who should be here?",
  lead,
  id = "invite",
}: {
  info: InviteInfo;
  title?: string;
  lead?: string;
  id?: string;
}) {
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");
  const [edited, setEdited] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState<"" | "link" | "message">("");

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const target = detect(contact);
  const generated = useMemo(() => buildMessage(info, name), [info, name]);
  // The full message with the link, for email, texts and WhatsApp.
  const full = edited ?? `${generated.body}\n\n${info.link}${generated.sign}`;
  const withLink = edited ? (edited.includes(info.link) ? edited : `${edited}\n\n${info.link}`) : full;
  const subject = info.mode === "member" && info.firstName ? `${info.firstName} invited you to PsyAlliance` : "Have a look at PsyAlliance";

  const flash = (what: "link" | "message") => {
    setCopied(what);
    window.setTimeout(() => setCopied(""), 2200);
  };
  const copy = async (value: string, what: "link" | "message") => {
    try {
      await navigator.clipboard.writeText(value);
      flash(what);
      return true;
    } catch {
      return false;
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "PsyAlliance", text: edited ? withLink.replace(info.link, "").trim() : `${generated.body}${generated.sign}`, url: info.link });
    } catch {
      /* closed without sharing */
    }
  };
  const linkedin = async () => {
    await copy(withLink, "message");
    window.open(target.value, "_blank", "noopener");
  };

  const mailto = `mailto:${target.kind === "email" ? encodeURIComponent(target.value).replace(/%40/g, "@") : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(withLink)}`;
  const sms = `sms:+${target.value}?&body=${encodeURIComponent(withLink)}`;
  const whatsapp = `https://wa.me/${target.value}?text=${encodeURIComponent(withLink)}`;

  return (
    <section className="card invite-box" id={id} aria-labelledby={`${id}-title`}>
      <div className="invite-intro">
        <div className="eyebrow">Invite a colleague</div>
        <h3 id={`${id}-title`}>{title}</h3>
        <p className="small">
          {lead ||
            (info.mode === "member"
              ? "Send them your own link from your email, phone or LinkedIn. When they join and are verified, you're each other's trusted colleagues."
              : info.mode === "sandbox"
                ? "Send a psychologist or psychiatrist the main site from your email, phone or LinkedIn. Nothing is sent from the sandbox itself."
                : "Send a psychologist or psychiatrist PsyAlliance from your email, phone or LinkedIn.")}
        </p>
        {info.mode === "member" && (
          <a className="text-arrow small" href="/dashboard/invite">Who&rsquo;s joined through your link &rarr;</a>
        )}
      </div>

      <div className="invite-form">
        <div className="invite-fields">
          <label className="field">
            Email, mobile number or LinkedIn profile
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="sam@practice.com, (917) 555-0142 or linkedin.com/in/…"
              autoComplete="off"
              aria-describedby={`${id}-kind`}
            />
          </label>
          <label className="field">
            Their first name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" autoComplete="off" />
          </label>
        </div>
        <p className="invite-kind micro-note" id={`${id}-kind`} aria-live="polite">
          {target.kind === "email" && "Email address. It opens in your own email."}
          {target.kind === "phone" && "Mobile number. Send it as a text or on WhatsApp."}
          {target.kind === "linkedin" && "LinkedIn profile. We copy the message; paste it into a message on their profile."}
          {!target.kind && contact.trim() && "That doesn't look like an email address, mobile number or LinkedIn profile yet."}
          {!contact.trim() && (canShare ? "Or tap Share to send it through any app on your phone." : "Or copy your link and send it however you like.")}
        </p>

        <div className="invite-actions">
          {target.kind === "email" && <a className="btn" href={mailto}>Write the email</a>}
          {target.kind === "phone" && (
            <>
              <a className="btn" href={sms}>Send a text</a>
              <a className="btn secondary" href={whatsapp} target="_blank" rel="noopener">WhatsApp</a>
            </>
          )}
          {target.kind === "linkedin" && (
            <button type="button" className="btn" onClick={linkedin}>
              {copied === "message" ? "Copied. Opening LinkedIn…" : "Copy message, open LinkedIn"}
            </button>
          )}
          {canShare && (
            <button type="button" className={`btn${target.kind ? " secondary" : ""}`} onClick={share}>
              Share&hellip;
            </button>
          )}
          {!target.kind && !canShare && <a className="btn secondary" href={mailto}>Email it</a>}
          <button type="button" className="btn ghost" onClick={() => copy(info.link, "link")}>
            {copied === "link" ? "Link copied" : "Copy link"}
          </button>
        </div>

        <details className="invite-message">
          <summary>See or change the message</summary>
          <textarea
            rows={6}
            value={edited ?? full}
            onChange={(e) => setEdited(e.target.value)}
            aria-label="Invitation message"
          />
          <div className="row between" style={{ marginTop: 6 }}>
            <span className="micro-note">Your link is added if you take it out.</span>
            {edited !== null && (
              <button type="button" className="plain-button small" onClick={() => setEdited(null)}>
                Start again
              </button>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}
