-- Migration 003 — Per-position qualifications for employees
--
-- Run this in the Supabase SQL Editor after 002_shift_templates.sql.
--
-- Employees were only 'manager' or 'crew', which assumed any crew member could
-- work any position. They can't — Register, Prep, Chef and Salads are distinct
-- jobs — so Auto-Schedule was putting people in positions they can't cover.
--
-- Replaced with two independent things:
--
--   skills      which positions a person can work; several per employee, since
--               someone who covers both Register and Prep should be usable for
--               either rather than being pinned to one
--   is_manager  a flag on top, not a position. Managers still get the MGR
--               badge, are preferred for Chef, and can cover the Stadium
--               register, while also having their own skills.
--
-- The old `role` column is left in place and simply unused. Drop it once you
-- have confirmed the roster looks right — see the note at the end.

begin;

alter table employees add column if not exists is_manager boolean not null default false;
alter table employees add column if not exists skills text[] not null default '{}';

-- Carry the old role across. Existing staff get every skill so nothing they
-- were previously eligible for silently stops being scheduled; narrow each
-- person down on the Employees screen afterwards.
update employees
set is_manager = true
where role = 'manager' and is_manager = false;

update employees
set skills = array['register', 'prep', 'chef', 'salads']
where skills = '{}';

-- Guard against typos in skill names.
alter table employees drop constraint if exists employees_skills_valid;
alter table employees add constraint employees_skills_valid
  check (skills <@ array['register', 'prep', 'chef', 'salads']::text[]);

-- The old role column is no longer written to, so stop it rejecting inserts
-- that omit it.
alter table employees alter column role drop not null;
alter table employees alter column role set default 'crew';

create index if not exists idx_employees_skills on employees using gin (skills);

-- ─────────────────────────────────────────────
-- Designated managers, fixed for the whole tournament (one per location).
--
--   general_manager  runs Food Village. Sits OUTSIDE the position grid — they
--                    oversee rather than hold a position, so Food Village
--                    still needs all its positions staffed. On site open to
--                    close every day Food Village is open.
--   stadium_manager  the one manager at the Stadium for the duration. Floats
--                    between Register and Prep, whichever is needed, and works
--                    open to close rather than a split shift.
--
-- Other managers are ordinary staff who happen to carry the manager flag and
-- are qualified for Register and Prep; they get scheduled like anyone else.
-- ─────────────────────────────────────────────
alter table tournament_settings
  add column if not exists general_manager_id uuid references employees(id) on delete set null;
alter table tournament_settings
  add column if not exists stadium_manager_id uuid references employees(id) on delete set null;

commit;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────
-- Once the Employees screen shows the right skills for everyone:
--
--   alter table employees drop column role;
--
-- Nothing in the app reads it after this migration.
-- ─────────────────────────────────────────────
