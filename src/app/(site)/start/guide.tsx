"use client";
import { useEffect, useRef, useState } from "react";
import { GUIDE, NEED_IDS, HELPS, HELP_LABEL, CONTEXT_LABEL, CONTEXTS, HANDOFF_COOKIE, HANDOFF_HOURS, type Need, type Help } from "@/lib/start-guide";

const PRIMARY: Need[] = ["time_away", "client_referral", "caseload", "perspective", "reducing", "explore"];
type Stage = "choose" | "follow" | "benefit" | "try" | "preview" | "summary";

function track(event: string, need?: string) {
  try { void fetch("/api/start-event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, need }), keepalive: true }); } catch {}
}
const readCookie = () => document.cookie.split("; ").find((c) => c.startsWith(`${HANDOFF_COOKIE}=`));

export function Guide() {
  const [stage, setStage] = useState<Stage>("choose");
  const [need, setNeed] = useState<Need | null>(null);
  const [ctx, setCtx] = useState("");
  const [helps, setHelps] = useState<Help[]>([]);
  const [saved, setSaved] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  // The exercise lives here, so the recipient preview and back keep it, and Reset clears it.
  const [sim, setSim] = useState<Sim>(SIM0);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const n = q.get("need") as Need | null;
    if (n && NEED_IDS.includes(n)) { setNeed(n); setStage(n === "offer_support" ? "follow" : "benefit"); }
    setSaved(!!readCookie());
    track("guide_start");
  }, []);
  // Move focus to the heading when the stage changes (for keyboard and screen-reader users), not on first load.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    head.current?.focus({ preventScroll: false });
  }, [stage]);
  useEffect(() => {
    const u = new URL(location.href);
    need ? u.searchParams.set("need", need) : u.searchParams.delete("need");
    history.replaceState(null, "", u.toString());
  }, [need]);

  const choose = (n: Need) => { setNeed(n); setSim(SIM0); track("guide_choice", n); setStage(n === "explore" ? "benefit" : "follow"); };
  const e = need ? GUIDE[need] : null;

  function keep() {
    if (!need) return;
    const v = encodeURIComponent(JSON.stringify({ need, ctx: ctx || undefined, helps: need === "offer_support" ? helps : undefined, exp: Date.now() + HANDOFF_HOURS * 3600 * 1000 }));
    document.cookie = `${HANDOFF_COOKIE}=${v}; Max-Age=${HANDOFF_HOURS * 3600}; Path=/; SameSite=Lax`;
    setSaved(true); track("summary_continue", need);
  }
  function clear() { document.cookie = `${HANDOFF_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`; setSaved(false); }
  const restart = () => { setNeed(null); setCtx(""); setHelps([]); setSim(SIM0); setStage("choose"); };

  return (
    <div className="guide-card" data-guide data-stage={stage} data-need={need || ""}>
      <span className="guide-fiction">Every person and request shown here is fictional</span>

      {stage === "choose" && (
        <>
          <h1 ref={head} tabIndex={-1} className="serif-title">What would be useful to you at the moment?</h1>
          <p className="guide-note">Choose one. You do not need an email address. We count which need is chosen, anonymously, to improve this page; nothing is linked to you.</p>
          <fieldset className="guide-choices">
            <legend className="sr-only">What would be useful to you at the moment?</legend>
            {PRIMARY.map((n) => (
              <label key={n}><input type="radio" name="need" value={n} onChange={() => choose(n)} checked={need === n} /> {GUIDE[n].choice}</label>
            ))}
          </fieldset>
          <button type="button" className="guide-quiet" data-offer onClick={() => choose("offer_support")}>I&rsquo;m here to offer support</button>
          <p className="guide-note">Prefer to go straight on? <a href="/auth/sign-up">Create your account</a> or <a href="/tour">watch the demos</a>.</p>
        </>
      )}

      {stage === "follow" && need && need !== "offer_support" && (
        <>
          <h2 ref={head} tabIndex={-1} className="serif-title">Which describes you best? <span className="guide-note">(optional)</span></h2>
          <fieldset className="guide-choices">
            <legend className="sr-only">Optional: your professional circumstance</legend>
            {CONTEXTS.map((c) => (
              <label key={c}><input type="radio" name="ctx" value={c} checked={ctx === c} onChange={() => setCtx(c)} /> {CONTEXT_LABEL[c]}</label>
            ))}
          </fieldset>
          <div className="guide-actions">
            <button className="btn" type="button" onClick={() => setStage("benefit")}>Continue</button>
            <button className="guide-quiet" type="button" data-skip onClick={() => { setCtx(""); setStage("benefit"); }}>Skip</button>
            <button className="guide-quiet" type="button" onClick={restart}>Change my choice</button>
          </div>
        </>
      )}

      {stage === "follow" && need === "offer_support" && (
        <>
          <h2 ref={head} tabIndex={-1} className="serif-title">Which kinds of request would you consider? <span className="guide-note">(optional)</span></h2>
          <p className="guide-note">Considering requests is not a commitment to accept any. Having no referral places does not stop you offering Cover or Consult.</p>
          <fieldset className="guide-choices">
            <legend className="sr-only">Kinds of request you would consider</legend>
            {HELPS.map((h) => (
              <label key={h}><input type="checkbox" checked={helps.includes(h)} onChange={() => setHelps(helps.includes(h) ? helps.filter((x) => x !== h) : [...helps, h])} /> {HELP_LABEL[h]}</label>
            ))}
          </fieldset>
          <div className="guide-actions">
            <button className="btn" type="button" onClick={() => setStage("benefit")}>Continue</button>
            <button className="guide-quiet" type="button" data-skip onClick={() => { setHelps([]); setStage("benefit"); }}>Skip</button>
            <button className="guide-quiet" type="button" onClick={restart}>Change my choice</button>
          </div>
        </>
      )}

      {stage === "benefit" && e && need && (
        <>
          <h2 ref={head} tabIndex={-1} className="serif-title" data-headline>{e.headline}</h2>
          <p data-benefit>{e.benefit}</p>
          <p className="guide-note">This shows what the product can do. It is not a promise of Cover, referrals, placements or response times.</p>
          <div className="guide-actions">
            <a className="btn" href={e.demo} data-demo onClick={() => track("demo_started", need)}>Watch the short demo</a>
            {need !== "explore" && <a className="btn secondary" data-try-scenario href={`${e.demo}#try`}>Try this scenario</a>}
            <button className="btn secondary" type="button" onClick={() => setStage("try")}>Try it myself</button>
            <button className="guide-quiet" type="button" onClick={() => setStage("summary")}>Skip to what comes next</button>
            <button className="guide-quiet" type="button" onClick={restart}>Change my choice</button>
          </div>
        </>
      )}

      {stage === "try" && need && (
        <>
          <h2 ref={head} tabIndex={-1} className="serif-title">Try it</h2>
          <Interaction need={need} sim={sim} setSim={setSim} onDone={() => track("interaction_complete", need)} />
          <div className="guide-actions">
            {need !== "explore" && need !== "caseload" && <button className="btn secondary" type="button" onClick={() => { track("recipient_preview", need); setStage("preview"); }}>What will they receive?</button>}
            <button className="btn" type="button" onClick={() => setStage("summary")}>Continue</button>
            <button className="guide-quiet" type="button" onClick={() => { track("interaction_skip", need); setStage("summary"); }}>Skip</button>
            <button className="guide-quiet" type="button" data-reset onClick={() => setSim(SIM0)}>Reset</button>
            <button className="guide-quiet" type="button" onClick={restart}>Change my choice</button>
          </div>
        </>
      )}

      {stage === "preview" && need && (
        <>
          <h2 ref={head} tabIndex={-1} className="serif-title">What they would receive</h2>
          <span className="guide-fiction">Example of the recipient&rsquo;s view</span>
          <Recipient need={need} />
          <div className="guide-actions">
            <button className="btn" type="button" onClick={() => setStage("try")}>Back to my view</button>
          </div>
        </>
      )}

      {stage === "summary" && e && need && (
        <div className="guide-summary" data-summary>
          <h2 ref={head} tabIndex={-1} className="serif-title">Your starting point</h2>
          <p data-summary-text>{e.summary}</p>
          <dl>
            <div><dt>You have chosen</dt><dd>{e.choice}{ctx ? ` (${CONTEXT_LABEL[ctx]})` : ""}{need === "offer_support" && helps.length ? `: ${helps.map((h) => HELP_LABEL[h]).join(", ")}` : ""}</dd></div>
            <div><dt>You will need</dt><dd>{e.needs}</dd></div>
            <div><dt>Still to be confirmed</dt><dd>Membership is for doctoral-level psychologists and psychiatrists with an active US licence. A person checks each licence before you are listed, and until then what you can do may be limited. Nothing is sent without your review.</dd></div>
          </dl>
          <p className="guide-note">Why we built it: <a href="/#why">read the founder&rsquo;s story</a>. <a href="/verification">How verification works</a>. <a href="/privacy">Privacy</a>.</p>
          <div className="guide-actions">
            <a className="btn" data-continue href="/auth/sign-up" onClick={keep}>{e.cta}</a>
            <a className="guide-quiet" href="/dashboard" data-skip-signup>Take me to the Hub instead</a>
          </div>
          <p className="guide-note">We&rsquo;ll use these choices to get you started. They stay in this browser for {HANDOFF_HOURS} hours and hold only your selections, nothing you typed.{saved ? " Choices are saved on this device." : ""}</p>
          <div className="guide-actions">
            <button className="guide-quiet" type="button" onClick={() => setStage("benefit")}>Review or change</button>
            <button className="guide-quiet" type="button" onClick={() => { clear(); restart(); }}>Start fresh</button>
            {saved && <button className="guide-quiet" type="button" data-clear onClick={clear}>Clear my choices</button>}
          </div>
        </div>
      )}
    </div>
  );
}

type Sim = { a: boolean; b: string };
const SIM0: Sim = { a: false, b: "" };

function Interaction({ need, sim, setSim, onDone }: { need: Need; sim: Sim; setSim: (s: Sim) => void; onDone: () => void }) {
  const { a, b } = sim;
  const setA = (v: boolean) => setSim({ ...sim, a: v });
  const setB = (v: string) => setSim({ ...sim, b: v });
  const done = () => onDone();
  if (need === "time_away")
    return (
      <div className="guide-sim" data-sim="time_away">
        <h3>Dr. Elena Marlowe has accepted your Cover request</h3>
        <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={a} onChange={(e) => { setA(e.target.checked); if (e.target.checked) done(); }} /> Secure handover information shared with Dr. Marlowe</label>
        <p className="ok" role="status">{a ? "That handover item is checked. Handover stays unfinished until every required item for this client is confirmed by you." : "Acceptance alone does not make the handover ready. Confirm each required item yourself."}</p>
      </div>
    );
  if (need === "client_referral" || need === "reducing")
    return (
      <div className="guide-sim" data-sim="referral">
        <h3>Dr. Priya Anand &middot; fictional match</h3>
        <button type="button" className="btn secondary small-btn" aria-expanded={a} onClick={() => { setA(!a); done(); }}>{a ? "Hide why this match" : "Why this match?"}</button>
        {a && <ul className="sub"><li>Licensed in the client&rsquo;s state</li><li>Works with the stated age group and setting</li><li>Capacity last confirmed 12 days ago (not a reserved place)</li></ul>}
        <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={b === "yes"} onChange={(e) => setB(e.target.checked ? "yes" : "")} /> Add to my shortlist</label>
        <p className="ok" role="status">{b === "yes" ? "Added to a simulated shortlist. Nothing has been sent, and you would review every recipient before sending." : "Not shortlisted yet."}</p>
        {need === "reducing" && <p className="guide-note">A permanent transfer is a referral. It is separate from temporary Cover.</p>}
      </div>
    );
  if (need === "perspective")
    return (
      <div className="guide-sim" data-sim="consult">
        <h3>Who would you like to ask?</h3>
        <fieldset className="guide-choices"><legend className="sr-only">Audience</legend>
          {[["one", "One colleague I choose"], ["group", "A group I belong to"], ["all", "Members who follow this topic"]].map(([v, l]) => (
            <label key={v}><input type="radio" name="aud" checked={b === v} onChange={() => { setB(v); done(); }} /> {l}</label>
          ))}
        </fieldset>
        <p className="ok" role="status">{b === "one" ? "Recipient review: only the colleague you chose would see the question." : b === "group" ? "Recipient review: the members of that group would see it, and no one else." : b === "all" ? "Recipient review: members following the topic could see it. You confirm before it is posted." : "Choose an audience to see who would receive it."}</p>
      </div>
    );
  if (need === "caseload")
    return (
      <div className="guide-sim" data-sim="caseload">
        <h3>How a sample profile reads</h3>
        <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={a} onChange={(e) => { setA(e.target.checked); done(); }} /> Open to referral requests</label>
        <p className="ok" role="status">{a ? "Dr. Sam Okafor (fictional): open to referral requests. Colleagues can ask; Sam chooses whether to accept each one." : "Dr. Sam Okafor (fictional): not taking referral requests. Still visible for Cover and Consult."}</p>
      </div>
    );
  if (need === "offer_support")
    return (
      <div className="guide-sim" data-sim="offer">
        <h3>Sample participation settings</h3>
        <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={a} onChange={(e) => { setA(e.target.checked); done(); }} /> Pause new referral requests</label>
        <p className="ok" role="status">{a ? "Referral requests are paused. Cover and Consult requests are unaffected, and work already under way carries on." : "All three kinds of request are open. Each can be paused on its own."}</p>
      </div>
    );
  return (
    <div className="guide-sim" data-sim="explore">
      <h3>The three services</h3>
      <p>Cover, Referrals and Consult each start from one card on the Hub. Search is always one tap away.</p>
      <a href="/tour" className="btn secondary small-btn" onClick={done}>Watch the introduction</a>
    </div>
  );
}

function Recipient({ need }: { need: Need }) {
  const [r, setR] = useState("");
  const kind = need === "time_away" ? "Cover request" : need === "perspective" ? "question" : "referral request";
  return (
    <div className="guide-sim" data-sim="recipient">
      <h3>Dr. Rachel Davis (fictional) sent you a {kind}</h3>
      <p>An anonymous need and practical requirements. No client name or identifying detail is ever included.</p>
      <div className="guide-actions">
        {["Interested", "Need to discuss", "Unable to help"].map((o) => (
          <button key={o} type="button" className="btn secondary small-btn" aria-pressed={r === o} onClick={() => setR(o)}>{o}</button>
        ))}
      </div>
      <p className="ok" role="status">
        {r === "" ? "Choose a response to see what it means. This is a simulation: nothing is sent." : r === "Interested" ? "Interested tells the sender you may be able to help. It is not Cover acceptance or a referral placement. For a referral you also confirm your current capacity, which does not reserve a place." : r === "Need to discuss" ? "Need to discuss opens a conversation first. Nothing is agreed and the sender’s queue waits." : "Unable to help closes your part, kindly and without a reason. The sender can move on."}
      </p>
      <p className="guide-note">Handover readiness is separate again: the sender confirms it, not the recipient&rsquo;s response.</p>
    </div>
  );
}
