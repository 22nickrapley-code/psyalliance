"use client";

import { useActionState, useEffect } from "react";
import { US_STATES } from "@/lib/us-states";
import { requestLibraryAction, type LeadState } from "./actions";

const ROLES = ["Psychologist", "Psychiatrist", "Other clinician", "Other"];

// The short form on a public template page: download it (when it's free)
// or ask to hear when it is. After a download it points to joining.
export function LeadForm({
  code,
  name,
  intent,
  joinHref,
  demoHref,
  preview = false,
}: {
  code: string;
  name: string;
  intent: "download" | "notify";
  joinHref: string;
  demoHref: string;
  preview?: boolean;
}) {
  const [state, action, pending] = useActionState<LeadState | null, FormData>(requestLibraryAction, null);

  useEffect(() => {
    if (state?.ok && state.url) window.location.href = state.url;
  }, [state]);

  if (state?.ok) {
    return (
      <div className="lib-done" role="status">
        {state.url ? (
          <>
            <b>Your download has started.</b>
            <p className="small">
              If it didn&rsquo;t, <a href={state.url}>download the {name} here</a>. The link works for ten minutes.
            </p>
          </>
        ) : state.intent === "notify" ? (
          <>
            <b>Thank you. We&rsquo;ll email you when the {name} is free to download.</b>
            <p className="small">Members can use every template now.</p>
          </>
        ) : (
          <>
            <b>Thank you.</b>
            <p className="small">This template isn&rsquo;t free to download yet. We&rsquo;ll email you when it is.</p>
          </>
        )}
        <div className="lib-done-actions">
          <a className="btn" href={joinHref}>Create your account</a>
          <a className="btn secondary" href={demoHref}>Watch the 2-minute demo</a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="lib-form" onSubmit={preview ? (e) => e.preventDefault() : undefined}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="source" value={`library-${code}`} />
      <label className="field">
        Your name
        <input name="full_name" required minLength={2} maxLength={120} autoComplete="name" />
      </label>
      <label className="field">
        Email
        <input name="email" type="email" required maxLength={200} autoComplete="email" />
      </label>
      <div className="lib-form-row">
        <label className="field">
          Role
          <select name="role" required defaultValue="">
            <option value="" disabled>Choose</option>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="field">
          State
          <select name="state" defaultValue="">
            <option value="">Choose</option>
            {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {state?.error && <p className="lib-error" role="alert">{state.error}</p>}
      <button type="submit" className={`btn${intent === "notify" ? " secondary" : ""}`} disabled={pending}>
        {pending ? "One moment" : intent === "download" ? "Download the template" : "Tell me when it's free"}
      </button>
      <p className="micro-note">
        We&rsquo;ll keep your email to tell you when this template is updated and when PsyAlliance opens in your state. See <a href="/privacy">Privacy</a>.
      </p>
    </form>
  );
}
