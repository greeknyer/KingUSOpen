-- Migration 016 — Guaranteed days per week
--
-- Run this in the Supabase SQL Editor after 015_register_period_shifts.sql.
--
-- Some staff come back every year on an agreed number of days. The app could
-- only ever CAP someone (max_shifts_per_week), never promise them anything, so
-- an agreed five days was left to whatever the fairness rules happened to give
-- them — which, being an even spread, is exactly what a deal is not.
--
-- min_shifts_per_week is that promise. Auto-Schedule fills anyone still short
-- of theirs before spreading the remaining slots evenly across everybody else.
--
--   min NULL   no arrangement; they share in the even spread as before
--   min 5      scheduled at least 5 days in the period, gaps then filled by
--              the rest of the crew
--
-- Both columns are counted per period, so Week 1, Week 2 and Week 3 each carry
-- their own allowance. Nobody is affected until a number is entered, so this
-- changes no existing schedule.

begin;

alter table employees
  add column if not exists min_shifts_per_week int;

alter table employees drop constraint if exists employees_min_shifts_valid;
alter table employees add constraint employees_min_shifts_valid
  check (min_shifts_per_week is null or min_shifts_per_week between 1 and 21);

-- A guarantee above the cap is a contradiction the scheduler cannot satisfy;
-- reject it here rather than let it silently go unmet every week.
alter table employees drop constraint if exists employees_min_within_max;
alter table employees add constraint employees_min_within_max
  check (
    min_shifts_per_week is null
    or max_shifts_per_week is null
    or min_shifts_per_week <= max_shifts_per_week
  );

commit;

notify pgrst, 'reload schema';
