"use client";

import { useState } from "react";

// A password box with a small eye to show or hide what's typed. When
// `matches` names another password field, this one checks it's the same
// before the form is sent.
export function PasswordField({
  name,
  id,
  autoComplete,
  minLength,
  required = true,
  matches,
}: {
  name: string;
  id?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  matches?: string;
}) {
  const [show, setShow] = useState(false);
  const check = (el: HTMLInputElement) => {
    if (!matches) return;
    const other = el.form?.elements.namedItem(matches) as HTMLInputElement | null;
    el.setCustomValidity(other && el.value && other.value !== el.value ? "The passwords don't match." : "");
  };
  return (
    <span className="pw-wrap">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        onInput={(e) => check(e.currentTarget)}
        onBlur={(e) => check(e.currentTarget)}
      />
      <button type="button" className="pw-eye" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(!show)}>
        {show ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.6 3.8M6.6 6.6C4.6 8 3.2 10 2.5 12c1 2.5 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M2.5 12C3.5 9.5 7 5 12 5s8.5 4.5 9.5 7c-1 2.5-4.5 7-9.5 7s-8.5-4.5-9.5-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        )}
      </button>
    </span>
  );
}
