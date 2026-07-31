-- Migration 007 — Full days as a per-date availability override
--
-- Run this in the Supabase SQL Editor after 006_full_day_staff.sql.
--
-- employees.works_full_day says someone normally works open to close. That is
-- their standing arrangement, but it varies: a prepper on full days may only
-- manage a shift on one particular day, and someone who normally works a shift
-- may cover a full day when the stand is short-handed.
--
-- availability.full_day overrides the employee-level flag for one date, exactly
-- as availability.shifts already overrides the weekly pattern:
--
--   NULL    use the employee's own works_full_day setting
--   true    open to close that date, whatever their usual arrangement
--   false   a normal shift that date, even if they usually work full days
--
-- No backfill: every existing row keeps NULL and so keeps inheriting.

begin;

alter table availability
  add column if not exists full_day boolean;

commit;

notify pgrst, 'reload schema';
