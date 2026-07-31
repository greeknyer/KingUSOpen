-- Migration 008 — Retire the fourth Food Village prep position
--
-- Run this in the Supabase SQL Editor after 007_availability_full_day.sql.
--
-- The Food Village runs three prep positions, not four. Prep 4 is gone from the
-- app, so any assignment still pointing at it would sit in the database without
-- appearing anywhere — invisible in the schedule grid, and impossible to edit
-- or remove through the UI.
--
-- This DELETES those rows. It only touches position = 'prep_4'; every other
-- assignment is untouched. If you would rather look before deleting, run the
-- SELECT first:
--
--   select date, slot_order, status, employee_id
--   from schedule_assignments
--   where position = 'prep_4'
--   order by date, slot_order;
--
-- Time entries are recorded per employee per date, not per position, so hours
-- already logged against a Prep 4 shift are unaffected and still reach payroll.

begin;

delete from schedule_assignments where position = 'prep_4';

commit;

notify pgrst, 'reload schema';
