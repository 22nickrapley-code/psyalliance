import { fileReportAction } from "../moderation-actions";

// "Report" control for anything a member wrote. Patient information comes
// first because it's the report that matters most: admins can redact it at
// once (see the moderation queue and migration 0084).
export function ReportContent({ targetType, targetId, returnTo, label = "Report" }: { targetType: string; targetId: string | number; returnTo: string; label?: string }) {
  return (
    <details className="report-content">
      <summary className="plain-button small">{label}</summary>
      <form action={fileReportAction} className="fields" style={{ marginTop: 8 }}>
        <input type="hidden" name="target_type" value={targetType} />
        <input type="hidden" name="target_id" value={String(targetId)} />
        <input type="hidden" name="return_to" value={returnTo} />
        <label className="field">
          What&rsquo;s wrong
          <select name="category" defaultValue="patient_information">
            <option value="patient_information">It identifies a patient</option>
            <option value="conduct">Unprofessional or inappropriate</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="field">
          Anything admins should know <span className="micro-note">(optional for patient information)</span>
          <textarea name="reason" rows={2} placeholder="Don't repeat the identifying details here." />
        </label>
        <button type="submit" className="btn secondary small-btn" style={{ alignSelf: "flex-start" }}>Send to admins</button>
      </form>
    </details>
  );
}
