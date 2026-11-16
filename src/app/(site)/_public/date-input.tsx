"use client";

import { useState, type InputHTMLAttributes } from "react";

// v13 (Nick, 15 Nov): a date box shows the device's own format, so the chosen date is also written out US-style
// underneath ("Fri, Nov 20, 2026") and can't be misread.
export function usDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
  if (!m) return "";
  return new Date(+m[1], +m[2] - 1, +m[3], 12).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function DateInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [value, setValue] = useState(String(props.value ?? props.defaultValue ?? ""));
  const words = usDate(value);
  return (
    <>
      <input
        {...props}
        type="date"
        onInput={(e) => {
          setValue(e.currentTarget.value);
          props.onInput?.(e);
        }}
        onChange={(e) => {
          setValue(e.currentTarget.value);
          props.onChange?.(e);
        }}
      />
      {words && (
        <small className="date-words" aria-live="polite">
          {words}
        </small>
      )}
    </>
  );
}
