"use client";

import { useRef, useState } from "react";

// Degree comes first: if it isn't doctoral, say so straight away, before
// anyone types a password, and offer the Library instead.
export function DegreeField() {
  const [other, setOther] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  return (
    <>
      <label className="field">
        Degree
        <select
          ref={ref}
          name="qualification"
          defaultValue=""
          required
          onChange={(e) => {
            const no = e.target.value === "other";
            setOther(no);
            e.target.closest("form")?.classList.toggle("not-eligible", no);
          }}
        >
          <option value="" disabled>Choose one</option>
          <option>PhD</option>
          <option>PsyD</option>
          <option>EdD</option>
          <option>MD</option>
          <option>DO</option>
          <option value="other">Master&rsquo;s-level or other</option>
        </select>
      </label>
      {other && (
        <div className="eligibility-note" role="status">
          <b>Membership is for doctoral clinicians.</b>
          <p>
            The network is for psychologists with a PhD, PsyD or EdD and psychiatrists with an MD or DO. The Practice Library is open to everyone, and every
            template can be used by master&rsquo;s-level clinicians.
          </p>
          <a className="btn" href="/library">Browse the Practice Library</a>
        </div>
      )}
    </>
  );
}
