"use client";

import { useRef, useState } from "react";
import { uploadDocument } from "./actions";

type TreatmentArea = { id: number; value: string };
type Folder = { id: number; name: string };

// Turns "client_intake_form_v2.pdf" into "client intake form v2" - close
// enough to a real title that most uploaders will just leave it as-is, but
// still a plain text input they can edit before submitting.
function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^./\\]+$/, "");
  return withoutExtension.replace(/[_-]+/g, " ").trim();
}

// Upload form for the Documents page - a real <form action={uploadDocument}>
// (so it still works without JS) enhanced with: drag-and-drop anywhere on
// this card, auto-filling the title from whatever file gets picked, a
// "General" catch-all option living inside the treatment-areas multi-select
// itself (mutually exclusive with picking real areas), and a folder picker
// that only applies to personal (not shared-library) uploads.
export default function UploadForm({
  treatmentAreas,
  folders,
}: {
  treatmentAreas: TreatmentArea[];
  folders: Folder[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [scope, setScope] = useState<"personal" | "world">("personal");
  const [selectedAreaValues, setSelectedAreaValues] = useState<string[]>([]);
  const isGeneral = selectedAreaValues.includes("general");

  function applyFile(file: File) {
    setFileName(file.name);
    if (titleInputRef.current) titleInputRef.current.value = titleFromFilename(file.name);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !fileInputRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInputRef.current.files = transfer.files;
    applyFile(file);
  }

  function toggleArea(value: string) {
    if (value === "general") {
      setSelectedAreaValues((prev) => (prev.includes("general") ? [] : ["general"]));
      return;
    }
    setSelectedAreaValues((prev) => {
      const withoutGeneral = prev.filter((v) => v !== "general");
      return withoutGeneral.includes(value)
        ? withoutGeneral.filter((v) => v !== value)
        : [...withoutGeneral, value];
    });
  }

  const [areaFilter, setAreaFilter] = useState("");
  const filteredAreas = treatmentAreas.filter((t) =>
    t.value.toLowerCase().includes(areaFilter.trim().toLowerCase())
  );

  return (
    <div>
      <form action={uploadDocument}>
        <div className="field-row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: "1 1 260px" }}>
            <label htmlFor="title">Title</label>
            <input id="title" name="title" type="text" ref={titleInputRef} placeholder="Auto-fills from the file you choose" />

            <div style={{ marginTop: "1rem" }}>
              <label htmlFor="file">File</label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleDrop}
                style={{
                  border: `1px dashed ${isDragActive ? "var(--accent)" : "var(--border-strong)"}`,
                  borderRadius: "var(--radius)",
                  padding: "1.5rem 1.25rem",
                  background: isDragActive ? "var(--accent-soft)" : "var(--bg-alt)",
                  textAlign: "center",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                <input
                  id="file"
                  name="file"
                  type="file"
                  required
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.csv"
                  style={{ margin: "0 auto" }}
                />
                <p className="muted" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
                  {fileName ? `Selected: ${fileName}` : "Drag a file in here, or use Choose file"} · PDF, Word, image, plain text or CSV, up to 15MB.
                </p>
              </div>
            </div>
          </div>

          <div className="field" style={{ maxWidth: 280 }}>
            <label htmlFor="treatment_area_search">Treatment areas</label>
            <input
              id="treatment_area_search"
              type="text"
              placeholder="Search areas…"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="tag-picker-search"
              disabled={isGeneral}
            />
            <div className="tag-picker">
              <button
                type="button"
                className={`tag-toggle${isGeneral ? " selected" : ""}`}
                onClick={() => toggleArea("general")}
              >
                General (not area-specific)
              </button>
              {!isGeneral &&
                filteredAreas.map((t) => {
                  const idStr = String(t.id);
                  const selected = selectedAreaValues.includes(idStr);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`tag-toggle${selected ? " selected" : ""}`}
                      onClick={() => toggleArea(idStr)}
                    >
                      {t.value}
                    </button>
                  );
                })}
              {!isGeneral && filteredAreas.length === 0 && (
                <span className="muted" style={{ fontSize: "0.78rem" }}>No areas match "{areaFilter}".</span>
              )}
            </div>
            {(isGeneral ? ["general"] : selectedAreaValues).map((v) => (
              <input key={v} type="hidden" name="treatment_area_ids" value={v} />
            ))}
            <p className="muted" style={{ marginTop: "0.3rem", marginBottom: 0, fontSize: "0.78rem" }}>
              {isGeneral ? "Marked General - not tied to any specific area." : `${selectedAreaValues.length} selected · click to toggle, pick as many as apply.`}
            </p>

            <div style={{ marginTop: "1rem" }}>
              <label htmlFor="owner_scope">Visibility</label>
              <select
                id="owner_scope"
                name="owner_scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as "personal" | "world")}
              >
                <option value="personal">Personal (only me)</option>
                <option value="world">Shared library (everyone)</option>
              </select>
            </div>

            {scope === "personal" && folders.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <label htmlFor="folder_id">Folder</label>
                <select id="folder_id" name="folder_id" defaultValue="">
                  <option value="">No folder (unfiled)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <button type="submit" style={{ marginTop: "1rem" }}>Upload</button>
      </form>
    </div>
  );
}
