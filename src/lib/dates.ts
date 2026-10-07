// One way to show dates everywhere: "Oct 6" (with the year when it isn't
// this year), in New York time, where the founding cohort practices. The
// server runs on UTC, so dates are never formatted without a zone.
export const APP_TIME_ZONE = "America/New_York";

const toDate = (d: string | Date) => (d instanceof Date ? d : /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00Z") : new Date(d));

export function shortDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = toDate(d);
  const year = (x: Date) => x.toLocaleDateString("en-US", { year: "numeric", timeZone: APP_TIME_ZONE });
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(year(date) !== year(new Date()) ? { year: "numeric" } : {}),
    timeZone: APP_TIME_ZONE,
  });
}

export function longDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  return toDate(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: APP_TIME_ZONE });
}
