// Shared revenue math, modeled on Rena's real spreadsheet:
// monthly gross = rate per session x sessions per week x 4.3 weeks/month
// monthly net   = gross x the book of business's retention fraction
// (retention accounts for the group-practice/agency cut, if any; a case
// with no book of business attached is assumed fully retained.)

export const WEEKS_PER_MONTH = 4.3;

export type CaseRow = {
  id: number;
  rate_per_session: number | null;
  sessions_per_week: number | null;
  book_of_business_id: number | null;
};

export type BookRow = {
  id: number;
  name: string;
  expense_burden_pct: number;
};

export function caseMonthlyGross(c: CaseRow): number {
  return (c.rate_per_session || 0) * (c.sessions_per_week || 0) * WEEKS_PER_MONTH;
}

export function caseMonthlyNet(c: CaseRow, books: BookRow[]): number {
  const gross = caseMonthlyGross(c);
  const book = books.find((b) => b.id === c.book_of_business_id);
  const retention = book ? book.expense_burden_pct : 1;
  return gross * retention;
}

export function currency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
