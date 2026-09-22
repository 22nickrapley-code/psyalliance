"use client";

import { useState } from "react";
import UploadForm from "./upload-form";

type TreatmentArea = { id: number; value: string };
type Folder = { id: number; name: string };

// Collapsed to a single button by default, mirroring Caseload's
// "+ Add a client" -> AddClientBox pattern exactly (per Nick's spec): a
// button opens the box, which holds the title/treatment-area/visibility
// fields plus the drag-and-drop file picker underneath.
export default function DocumentsUploadBox({
  treatmentAreas,
  folders,
}: {
  treatmentAreas: TreatmentArea[];
  folders: Folder[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)}>
        + Upload a document
      </button>
    );
  }

  return (
    <div className="caseload-add-box">
      <div className="widget-header">
        <h3 style={{ margin: 0 }}>Upload a document</h3>
        <button
          type="button"
          className="secondary"
          onClick={() => setExpanded(false)}
          style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
        >
          Close
        </button>
      </div>
      <UploadForm treatmentAreas={treatmentAreas} folders={folders} />
    </div>
  );
}
