import { backLabel } from "@/lib/back";

// Shown on an edit screen reached from somewhere else: the way back, and
// the field that brings the save back there too.
export function BackLink({ back }: { back?: string | null }) {
  if (!back) return null;
  return (
    <a className="text-arrow back-link" href={back}>
      &larr; Back to {backLabel(back)}
    </a>
  );
}

export function BackField({ back }: { back?: string | null }) {
  if (!back) return null;
  return <input type="hidden" name="back" value={back} />;
}
