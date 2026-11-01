
// Shown on an edit screen reached from somewhere else: the way back, and
// the field that brings the save back there too.
// 1.1: the account frame shows one "Back" bar for every page reached with ?back=, so this stays empty.
export function BackLink(_props: { back?: string | null }) {
  return null;
}

export function BackField({ back }: { back?: string | null }) {
  if (!back) return null;
  return <input type="hidden" name="back" value={back} />;
}
