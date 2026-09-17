-- Defense-in-depth data integrity checks.
--
-- The UI already constrains these (min="0" on number inputs, a fixed
-- cadence <select>), but nothing at the database layer stopped a direct
-- insert/update - a bug, a future integration, or someone bypassing the
-- form - from writing a negative rate, a negative caseload, or an
-- out-of-range percentage straight into the table. These checks make the
-- invalid states unrepresentable regardless of entry point. All of the
-- constrained columns are nullable, so the checks only fire when a value
-- is actually present.

alter table caseload_clients
  add constraint caseload_clients_rate_non_negative
    check (rate_per_session is null or rate_per_session >= 0),
  add constraint caseload_clients_sessions_non_negative
    check (sessions_per_week is null or sessions_per_week >= 0);

alter table capacity_settings
  add constraint capacity_settings_target_sessions_non_negative
    check (target_sessions_per_week is null or target_sessions_per_week >= 0),
  add constraint capacity_settings_vacation_days_non_negative
    check (annual_vacation_days is null or annual_vacation_days >= 0),
  add constraint capacity_settings_no_show_rate_pct_range
    check (no_show_rate_pct is null or (no_show_rate_pct >= 0 and no_show_rate_pct <= 100)),
  add constraint capacity_settings_missed_charge_pct_range
    check (missed_session_charge_pct is null or (missed_session_charge_pct >= 0 and missed_session_charge_pct <= 100));

-- practice_overhead_expenses.amount/monthly_cost are not-null, so no "is null or" needed.
alter table practice_overhead_expenses
  add constraint practice_overhead_expenses_amount_non_negative
    check (amount >= 0),
  add constraint practice_overhead_expenses_monthly_cost_non_negative
    check (monthly_cost >= 0),
  add constraint practice_overhead_expenses_cadence_valid
    check (cadence in ('monthly', 'annual'));
