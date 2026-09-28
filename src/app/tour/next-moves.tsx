import { JOIN_URL } from "@/lib/env";

// The two separate ways forward at the end of a tour: try it with
// fictional data, or ask to join the real, invitation-only network.
export function NextMoves() {
  return (
    <div className="next-moves">
      <section className="card">
        <div className="eyebrow">Try it yourself</div>
        <h3>Explore a sandbox</h3>
        <p className="small">
          Your own private copy of Alex&rsquo;s fictional practice for 7 days. Send requests and invented colleagues reply. Ask, and we email you a
          personal link; resetting it clears your fictional activity.
        </p>
        <a className="btn secondary" href="/sandbox/request">Ask for a sandbox</a>
      </section>
      <section className="card">
        <div className="eyebrow">The real network</div>
        <h3>Ask to join the founding cohort</h3>
        <p className="small">
          For doctoral-level psychologists and psychiatrists. We invite a few states at a time, and a person checks every licence against the state board.
        </p>
        <a className="btn" href={JOIN_URL}>Request an invitation</a>
      </section>
    </div>
  );
}
