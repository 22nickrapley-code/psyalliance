// Effective availability: what a colleague should actually be told.
// A setting nobody has confirmed, or confirmed long ago, isn't shown as
// "Accepting referrals" (launch audit), and a pause always wins.

const STALE_DAYS = 90;

export type Effective = { label: string; open: boolean; confirmed: boolean };

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function pausedLabel(pausedUntil: string | null | undefined): string | null {
  if (!pausedUntil) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (pausedUntil < today) return null;
  return `Paused until ${new Date(pausedUntil + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

export function effectiveReferral(value: string | null | undefined, confirmedAt: string | null | undefined, pausedUntil?: string | null): Effective {
  const paused = pausedLabel(pausedUntil);
  if (paused) return { label: paused, open: false, confirmed: true };
  const age = daysSince(confirmedAt);
  if (age === null) return { label: "Availability not confirmed", open: false, confirmed: false };
  if (age > STALE_DAYS) return { label: "Availability not confirmed recently", open: false, confirmed: false };
  if (value === "yes") return { label: "Accepting referrals", open: true, confirmed: true };
  if (value === "limited") return { label: "Selected referrals only", open: true, confirmed: true };
  if (value === "no") return { label: "Not accepting referrals", open: false, confirmed: true };
  return { label: "Availability not set", open: false, confirmed: false };
}

export function effectiveCover(value: string | null | undefined, confirmedAt: string | null | undefined, pausedUntil?: string | null): Effective {
  const paused = pausedLabel(pausedUntil);
  if (paused) return { label: paused, open: false, confirmed: true };
  const age = daysSince(confirmedAt);
  if (age === null) return { label: "Availability not confirmed", open: false, confirmed: false };
  if (age > STALE_DAYS) return { label: "Availability not confirmed recently", open: false, confirmed: false };
  if (value === "yes") return { label: "Available for cover", open: true, confirmed: true };
  if (value === "ask_me") return { label: "Cover: ask me", open: true, confirmed: true };
  if (value === "no") return { label: "Not available for cover", open: false, confirmed: true };
  return { label: "Cover availability not set", open: false, confirmed: false };
}
