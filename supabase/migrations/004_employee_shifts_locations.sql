-- Migration 004 — Which shifts and locations each employee can work
--
-- Run this in the Supabase SQL Editor after 003_employee_skills.sql.
--
-- Two more constraints on where Auto-Schedule may place someone, alongside the
-- skills added in 003:
--
--   shifts     which shift numbers a person can ever work. Not everyone can do
--              every shift — someone who can only do evenings should never land
--              on the 10am opener. This is a standing preference, not per-day;
--              the availability grid still handles "off on Tuesday".
--   locations  Food Village, Stadium, or both. Some staff work the Stadium
--              only, and were previously eligible for anything.
--
-- Existing staff get every shift and both locations so nobody silently stops
-- being scheduled; narrow each person down on the Employees screen afterwards.

begin;

alter table employees
  add column if not exists shifts int[] not null default '{1,2,3}';
alter table employees
  add column if not exists locations text[] not null default '{food_village,stadium}';

-- Anyone added between 003 and this migration gets the same permissive default.
update employees set shifts    = '{1,2,3}'                    where shifts = '{}';
update employees set locations = '{food_village,stadium}'     where locations = '{}';

-- Guard against values the app would never produce.
alter table employees drop constraint if exists employees_shifts_valid;
alter table employees add constraint employees_shifts_valid
  check (shifts <@ array[1, 2, 3]);

alter table employees drop constraint if exists employees_locations_valid;
alter table employees add constraint employees_locations_valid
  check (locations <@ array['food_village', 'stadium']::text[]);

create index if not exists idx_employees_locations on employees using gin (locations);

commit;

notify pgrst, 'reload schema';
