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
    if (fields.states_qualified.length > 0) setValue("states_qualified", fields.states_qualified.join(", "));
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
    <div className="card">
      <h2>Quick start (optional)</h2>
      <p className="muted">
        Paste your bio from Psychology Today, your practice website, LinkedIn, a CV, anywhere you
        already have one written. We'll pre-fill what we can below so you're not starting from a
        blank page; you still review and save it yourself.
      </p>
      <textarea
        value={bioText}
        onChange={(e) => setBioText(e.target.value)}
        rows={6}
        placeholder="Paste your bio text here…"
        style={{ width: "100%", fontFamily: "inherit", fontSize: "0.9rem", padding: "0.6rem" }}
      />
      <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button type="button" className="secondary" onClick={handleParse} disabled={isPending || !bioText.trim()}>
          {isPending ? "Reading…" : "Fill in from this text"}
        </button>
        {message && (
          <span
            className={isError ? undefined : "muted"}
            style={{ fontSize: "0.85rem", color: isError ? "#b3392c" : undefined }}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
