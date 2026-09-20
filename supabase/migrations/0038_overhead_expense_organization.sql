-- Nick: overhead expenses should be attributable to a specific organization
-- (most will be "private practice" but a consultancy-specific tool, say,
-- shouldn't get lumped into the same pool as everything else). Nullable and
-- ON DELETE SET NULL rather than a required FK or cascade delete - an
-- expense with no organization picked just means "general/unassigned",
-- same meaning "Unassigned" already carries on the Income page's
-- caseload-by-organization table, and deleting an organization shouldn't
-- silently delete its expense history.
alter table practice_overhead_expenses
  add column book_of_business_id bigint references books_of_business (id) on delete set null;

create index practice_overhead_expenses_book_of_business_id_idx
  on practice_overhead_expenses (book_of_business_id);
