import { deleteAccountAction } from "./actions";

// Deleting your account: plain about what goes, and a typed confirmation so
// it can't happen by accident.
export function DeleteAccount() {
  return (
    <details className="control-details delete-account">
      <summary className="btn ghost block">Delete your account</summary>
      <p className="small">
        This removes your profile, licenses, availability, saved documents, plans and your part in conversations, and signs you out. It can&rsquo;t be undone.
        Colleagues&rsquo; own records stay theirs.
      </p>
      <form action={deleteAccountAction} className="stack" style={{ gap: 8 }}>
        <label className="field">
          Type DELETE to confirm
          <input name="confirm" autoComplete="off" required pattern="DELETE" title="Type DELETE in capitals" />
        </label>
        <button type="submit" className="btn danger block">Delete my account</button>
      </form>
    </details>
  );
}
