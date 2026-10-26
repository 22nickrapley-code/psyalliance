// The Extended Leave Pack opened as a PDF, for the Practice Library demo
// (Nick, 18 Oct: the demo opens a PDF and scrolls through it). Drawn as
// three pages so the video can scroll from the cover to the handoff form.
// Fictional throughout; nothing here identifies anyone.

export function PdfPreview({ title, fileName }: { title: string; fileName: string }) {
  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <a className="pdf-back" href="#">&larr; Back to the template</a>
        <span className="pdf-name">{fileName}</span>
        <span className="pdf-pages-count">3 pages</span>
      </div>
      <div className="pdf-pages">
        <section className="pdf-page" id="pdf-p1">
          <div className="pdf-brand">PsyAlliance Practice Library</div>
          <h1>{title}</h1>
          <p className="pdf-sub">For leave of more than two weeks. Version 1.</p>
          <h2>How to use this pack</h2>
          <ol>
            <li>Decide the dates, and who covers each client while you&rsquo;re away.</li>
            <li>Tell each client in writing, using the letter on page 2.</li>
            <li>Complete a handoff summary for each client with the colleague covering (page 3), outside PsyAlliance.</li>
            <li>When you&rsquo;re back, work through the return-to-practice checklist.</li>
          </ol>
          <h2>Before you go</h2>
          <ul>
            <li>Confirm each covering colleague&rsquo;s license in the client&rsquo;s state.</li>
            <li>Agree how urgent matters reach the covering colleague.</li>
            <li>Set your out-of-office message and voicemail.</li>
          </ul>
        </section>
        <section className="pdf-page" id="pdf-p2">
          <div className="pdf-running">Extended Leave Pack &middot; page 2</div>
          <h2>Client notification letter</h2>
          <p className="pdf-letter">
            Dear [client],
            <br />
            <br />I will be away from my practice from [first day] to [return date]. While I&rsquo;m away, [colleague], a licensed [psychologist or
            psychiatrist], will be available to see you. [Colleague] can be reached at [contact details]. With your permission I will share a short summary so
            your care continues smoothly.
            <br />
            <br />If you have an urgent concern, call [crisis line] or go to your nearest emergency department.
          </p>
          <h2>Who does what</h2>
          <table className="pdf-table">
            <tbody>
              <tr><th>Scheduling</th><td>Covering colleague</td></tr>
              <tr><th>Urgent contact</th><td>Covering colleague, then crisis line</td></tr>
              <tr><th>Records</th><td>Each clinician keeps their own notes</td></tr>
              <tr><th>Billing</th><td>Agreed in writing before you go</td></tr>
            </tbody>
          </table>
        </section>
        <section className="pdf-page" id="pdf-p3">
          <div className="pdf-running">Extended Leave Pack &middot; page 3</div>
          <h2>Clinical handoff summary</h2>
          <p className="pdf-note">Complete one per client, together with the covering colleague, and keep it outside PsyAlliance.</p>
          <table className="pdf-table form">
            <tbody>
              <tr><th>Reason for care</th><td /></tr>
              <tr><th>Current approach</th><td /></tr>
              <tr><th>Risk and safety plan</th><td /></tr>
              <tr><th>Medication and prescriber</th><td /></tr>
              <tr><th>Session frequency</th><td /></tr>
              <tr><th>Next appointment</th><td /></tr>
            </tbody>
          </table>
          <h2>Return-to-practice checklist</h2>
          <ul>
            <li>Read each covering colleague&rsquo;s update.</li>
            <li>Contact clients to confirm your first sessions back.</li>
            <li>Thank your covering colleagues, and settle any agreed fees.</li>
          </ul>
        </section>
      </div>
      <div className="pdf-actions">
        <button type="button" className="btn">Save PDF to My Library</button>
        <a className="btn secondary" href="#">Download</a>
      </div>
    </div>
  );
}
