"use client";

import { useState, useTransition } from "react";
import { parseProfileBio } from "./actions";

// Optional "paste your bio and we'll fill in the boring parts" box. Reads
// nothing from and writes nothing to any database - it just asks the model
// to extract fields from text the practitioner pastes themselves, then sets
// the matching form inputs' values directly via the DOM (these are all
// defaultValue/defaultChecked - i.e. uncontrolled - inputs, so this doesn't
// fight React). The practitioner still reviews everything and has to click
// "Save profile" themselves; nothing here submits the form.
export default function BioImportBox() {
  const [bioText, setBioText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function applyFields(fields: NonNullable<Awaited<ReturnType<typeof parseProfileBio>>["fields"]>) {
    const setValue = (id: string, value: string | null | undefined) => {
      if (!value) return;
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (el) el.value = value;
    };
    setValue("full_name", fields.full_name);
    setValue("credential_prefix", fields.credential_prefix);
    setValue("qualification_level", fields.qualification_level);
    setValue("primary_practice_city", fields.primary_practice_city);
    if (fields.states_qualified.length > 0) setValue("primary_state", fields.states_qualified[0].toUpperCase());
    setValue("pronoun", fields.pronoun);
    setValue("practice_website", fields.practice_website);
    setValue("contact_phone", fields.contact_phone);
    setValue("contact_email", fields.contact_email);
  }

  function applyMatchedLookups(ids: number[]) {
    for (const id of ids) {
      const checkbox = document.getElementById(`lv_${id}`) as HTMLInputElement | null;
      if (checkbox) checkbox.checked = true;
    }
  }

  function handleParse() {
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const result = await parseProfileBio(bioText);
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
        return;
      }
      if (result.fields) applyFields(result.fields);
      if (result.matchedLookupIds) applyMatchedLookups(result.matchedLookupIds);
      const appliedCount =
        Object.values(result.fields || {}).filter((v) => (Array.isArray(v) ? v.length > 0 : !!v)).length +
        (result.matchedLookupIds?.length || 0);
      setMessage(
        appliedCount > 0
          ? `Applied ${appliedCount} field${appliedCount === 1 ? "" : "s"}${
              result.matchedLabels && result.matchedLabels.length > 0
                ? ` including: ${result.matchedLabels.slice(0, 6).join(", ")}${result.matchedLabels.length > 6 ? "…" : ""}`
                : ""
            }. Review everything below, then Save profile at the bottom.`
          : "Didn't find anything usable in that text - you can still fill the form in manually below."
      );
    });
  }

  return (
    <details className="card tint">
      <summary style={{ cursor: "pointer" }}>
        <strong>Quick start:</strong> <span className="small">paste an existing bio and we&rsquo;ll pre-fill what we can</span>
      </summary>
      <p className="small" style={{ marginTop: 10 }}>
        From Psychology Today, your practice website, LinkedIn or a CV. Nothing is saved until you review the form and press Save.
      </p>
      <label className="field">
        Your existing bio
        <textarea value={bioText} onChange={(e) => setBioText(e.target.value)} rows={5} placeholder="Paste your bio text here" />
      </label>
      <div className="row wrap" style={{ marginTop: 10 }}>
        <button type="button" className="btn secondary small-btn" onClick={handleParse} disabled={isPending || !bioText.trim()}>
          {isPending ? "Reading..." : "Fill in from this text"}
        </button>
        {message && (
          <span className="small" role="status" style={{ color: isError ? "#9b2c22" : undefined }}>
            {message}
          </span>
        )}
      </div>
    </details>
  );
}
