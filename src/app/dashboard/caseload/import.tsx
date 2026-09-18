"use client";

import { useState, useTransition } from "react";
import { parseCaseloadImport, bulkImportCases, type ImportedCaseRow } from "./actions";

// Optional convenience alongside the manual "Add a case" form below - drop
// in a CSV export (from Excel, or copied straight out of an insurance
// panel's dashboard) and get a reviewable list of candidate cases instead
// of typing each one in by hand. Nothing reaches the database until the
// practitioner reviews the parsed rows and clicks "Import selected".
export default function CaseloadImportBox() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ImportedCaseRow[] | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result || ""));
    reader.readAsText(file);
  }

  function handleParse() {
    setMessage(null);
    setIsError(false);
    setRows(null);
    startTransition(async () => {
      const result = await parseCaseloadImport(rawText);
      if (result.error || !result.rows) {
        setIsError(true);
        setMessage(result.error || "Nothing came back.");
        return;
      }
      setRows(result.rows);
      setChecked(result.rows.map(() => true));
      setMessage(`Found ${result.rows.length} case${result.rows.length === 1 ? "" : "s"} - review below, then import.`);
    });
  }

  function handleImport() {
    if (!rows) return;
    const selected = rows.filter((_, i) => checked[i]);
    if (selected.length === 0) {
      setIsError(true);
      setMessage("Nothing selected to import.");
      return;
    }
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const result = await bulkImportCases(selected);
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
        return;
      }
      setMessage(`Imported ${result.imported} case${result.imported === 1 ? "" : "s"}.`);
      setRows(null);
      setRawText("");
    });
  }

  return (
    <div className="card">
      <h2>Or import from a file (optional)</h2>
      <p className="muted">
        Drop in a CSV export — from Excel, or copied out of an insurance panel's dashboard — and
        we'll propose a list of cases for you to review before anything is added. Client names are
        never stored: anything that looks like a name is converted to initials only. This is just
        a shortcut alongside "Add a case" below, not a requirement.
      </p>
      <div className="field-row" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label htmlFor="caseload_import_file">CSV or text file</label>
          <input
            id="caseload_import_file"
            type="file"
            accept=".csv,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      </div>
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={5}
        placeholder="…or paste rows of caseload data here"
        style={{ width: "100%", fontFamily: "inherit", fontSize: "0.85rem", padding: "0.6rem", marginTop: "0.5rem" }}
      />
      <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button type="button" className="secondary" onClick={handleParse} disabled={isPending || !rawText.trim()}>
          {isPending && !rows ? "Reading…" : "Parse"}
        </button>
        {message && !rows && (
          <span style={{ fontSize: "0.85rem", color: isError ? "#b3392c" : "var(--muted)" }}>{message}</span>
        )}
      </div>

      {rows && rows.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Label</th>
                <th>Organization</th>
                <th>State</th>
                <th>Session type</th>
                <th>Insurance</th>
                <th>Primary need</th>
                <th>Rate</th>
                <th>Sessions/wk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checked[i] ?? true}
                      onChange={(e) => {
                        const next = [...checked];
                        next[i] = e.target.checked;
                        setChecked(next);
                      }}
                    />
                  </td>
                  <td>{r.private_label || "—"}</td>
                  <td>{r.organization_name || "—"}</td>
                  <td>{r.state || "—"}</td>
                  <td>{r.session_type || "—"}</td>
                  <td>{r.insurance || "—"}</td>
                  <td>{r.primary_need || "—"}</td>
                  <td>{r.rate_per_session ?? "—"}</td>
                  <td>{r.sessions_per_week ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button type="button" onClick={handleImport} disabled={isPending}>
              {isPending ? "Importing…" : `Import selected (${checked.filter(Boolean).length})`}
            </button>
            {message && (
              <span style={{ fontSize: "0.85rem", color: isError ? "#b3392c" : "var(--muted)" }}>{message}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
