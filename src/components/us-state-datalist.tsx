import { US_STATES } from "@/lib/us-states";

// Pairs with <input list="us-states" ... /> on every state field in the
// app: typing either the 2-letter code or the full name (e.g. "tex")
// surfaces "Texas" as a suggestion, and picking it fills in the code that
// actually gets stored/matched on. Doesn't hard-block a value outside the
// list (native <datalist> is a suggestion, not a strict combobox), but it
// makes the fast, correct path the easy one instead of a free-for-all text
// box - no more scrolling a 50-item <select>, and far fewer typos than
// typing a state out by hand.
export default function UsStateDatalist({ id = "us-states" }: { id?: string }) {
  return (
    <datalist id={id}>
      {US_STATES.map((s) => (
        <option key={s.code} value={s.code} label={s.name}>
          {s.name}
        </option>
      ))}
    </datalist>
  );
}
