-- Migration 004 — Where and when each employee can work
--
-- Run this in the Supabase SQL Editor after 003_employee_skills.sql.
--
-- Two more constraints on where Auto-Schedule may place someone, alongside the
-- position skills added in 003:
--
--   locations            Food Village, Stadium, or both. Some staff work the
--                        Stadium only and were previously eligible for anything.
--
--   weekly_availability  which shifts a person can work on each day of the
--                        week. Keyed 0 = Monday through 6 = Sunday, with the
--                        values being the shift periods 'am', 'mid' and 'pm'.
--
-- A weekly pattern rather than one flat list of shifts, because availability
-- varies by day as well as by shift: someone may do AM on some days and PM on
-- others, and "Monday to Friday, no weekends" is just empty arrays on 5 and 6.
-- An employee available every shift every day is what the app calls Open.
--
-- Individual dates someone cannot work are NOT stored here — the existing
-- availability table already records that per date, and the Availability screen
-- edits it. This covers the standing pattern; that covers the exceptions.
--
-- Existing staff default to Open and both locations so nobody silently stops
-- being scheduled; narrow each person down on the Employees screen afterwards.

begin;

alter table employees
  add column if not exists locations text[] not null default '{food_village,stadium}';

alter table employees
  add column if not exists weekly_availability jsonb not null default
    '{"0":["am","mid","pm"],
      "1":["am","mid","pm"],
      "2":["am","mid","pm"],
      "3":["am","mid","pm"],
      "4":["am","mid","pm"],
      "5":["am","mid","pm"],
      "6":["am","mid","pm"]}'::jsonb;

-- Anyone added between 003 and this migration gets the same permissive default.
update employees set locations = '{food_village,stadium}' where locations = '{}';
update employees
set weekly_availability = '{"0":["am","mid","pm"],"1":["am","mid","pm"],"2":["am","mid","pm"],"3":["am","mid","pm"],"4":["am","mid","pm"],"5":["am","mid","pm"],"6":["am","mid","pm"]}'::jsonb
where weekly_availability = '{}'::jsonb;

-- A cap on how many shifts someone may be given in one period (Week 1, 2, 3,
-- or the pre-tournament block). NULL means no cap. Auto-Schedule stops handing
-- someone shifts once they reach it, so a part-timer capped at 3 stays at 3
-- however short-staffed the week is.
alter table employees
  add column if not exists max_shifts_per_week int;

alter table employees drop constraint if exists employees_max_shifts_valid;
alter table employees add constraint employees_max_shifts_valid
  check (max_shifts_per_week is null or max_shifts_per_week between 1 and 21);

-- Guard against values the app would never produce.
alter table employees drop constraint if exists employees_locations_valid;
alter table employees add constraint employees_locations_valid
  check (locations <@ array['food_village', 'stadium']::text[]);

create index if not exists idx_employees_locations on employees using gin (locations);

commit;

notify pgrst, 'reload schema';
