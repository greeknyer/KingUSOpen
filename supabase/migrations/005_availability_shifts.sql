-- Migration 005 — Shift-level availability overrides
--
-- Run this in the Supabase SQL Editor after 004_employee_shifts_locations.sql.
--
-- The availability table recorded only whether someone could work a date at
-- all. That could not express "open all of Week 1, but PM only on some days of
-- Week 2" — a real pattern, since people's availability changes week to week
-- during the tournament.
--
-- availability.shifts records WHICH shifts are workable on that specific date,
-- overriding the employee's standing weekly_availability pattern:
--
--   no row for the date   use the standing weekly pattern
--   shifts = '{}'         not available at all that date
--   shifts = '{pm}'       PM only that date, whatever the pattern says
--
-- available is kept in step (true when shifts is non-empty) so nothing reading
-- the old column changes behaviour.

begin;

alter table availability
  add column if not exists shifts text[];

alter table availability drop constraint if exists availability_shifts_valid;
alter table availability add constraint availability_shifts_valid
  check (shifts is null or shifts <@ array['am', 'mid', 'pm']::text[]);

-- Existing rows carry only a boolean. An explicit "unavailable" becomes an
-- empty shift list; an explicit "available" is left as NULL, meaning "available
-- for whatever the standing pattern allows" rather than inventing shifts that
-- were never actually chosen.
update availability set shifts = '{}' where available = false and shifts is null;

commit;

notify pgrst, 'reload schema';
