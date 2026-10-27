// The one fictional person the sandbox and the guided demos share: Rachel
// Davis, PhD, a clinical psychologist in Boston, licensed in Massachusetts,
// New York and Vermont. Keep the facts here identical to
// private.seed_demo_viewer (migration 0119) and the demo scenes.

export function RachelCard({ compact, eyebrow = "In every demo you’re" }: { compact?: boolean; eyebrow?: string }) {
  return (
    <div className={`story-alex${compact ? " compact" : ""}`}>
      <span className="story-initials" aria-hidden="true">RD</span>
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h3>Rachel Davis, PhD</h3>
        <p>Clinical psychologist in Boston, Massachusetts</p>
        {compact && <p className="story-alex-line">Cover for the fall, referrals waiting and colleagues to meet. Licensed in Massachusetts, New York and Vermont.</p>}
        {!compact && (
          <ul className="story-facts">
            <li>Licensed in Massachusetts, New York and Vermont</li>
            <li>Adults and young adults: anxiety, low mood and life transitions</li>
            <li>Cover for the fall in progress, with colleagues already answering</li>
            <li>1,200 fictional colleagues across NY, NJ, MA, CT, RI and VT</li>
          </ul>
        )}
      </div>
    </div>
  );
}
