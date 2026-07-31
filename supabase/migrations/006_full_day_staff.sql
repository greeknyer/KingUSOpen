-- Migration 006 — Staff who work full days rather than a shift
--
-- Run this in the Supabase SQL Editor after 005_availability_shifts.sql.
--
-- Not everyone rotates through AM / MID / PM. Some managers and some preppers
-- work a position from open to close, which the shift model could not express —
-- they were being handed a single AM or PM shift like anyone else.
--
-- works_full_day marks those people. Auto-Schedule gives them one assignment
-- spanning that day's opening hours, and the position they hold needs nobody on
-- its later shifts, exactly as the designated Stadium manager already worked.
--
-- The General Manager stays a separate thing: they are set in Tournament Setup
-- and sit OUTSIDE the position grid entirely, whereas a full-day employee holds
-- a real position for the day.

begin;

alter table employees
  add column if not exists works_full_day boolean not null default false;

commit;

notify pgrst, 'reload schema';
