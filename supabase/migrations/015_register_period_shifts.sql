-- Migration 015 — Which shifts each register runs, per period
--
-- Run this in the Supabase SQL Editor after 014_register_times.sql.
--
-- A register's shape changes between weeks. In Week 1 there are three tills and
-- Register 3 is the midday one; from Week 2 there are four, Register 3 opens at
-- 11am as a normal AM/PM till, and Register 4 becomes the midday one. Which
-- shifts a position runs was fixed in code, so it could not differ by period.
--
-- register4_config already holds per-period settings for a position, so it
-- gains a `shifts` column rather than a second table being invented:
--
--   shifts = '{am,pm}'   opens and closes, handing over once
--   shifts = '{mid}'     a single midday till
--   shifts = '{}'        that till is closed for the period
--   no row               use the position's default
--
-- Empty shifts replaces is_active for the registers, so a till being closed is
-- said one way rather than two. Prep 4 keeps using the Optional Positions
-- switch, and its rows are carried across from is_active.

begin;

alter table register4_config
  add column if not exists shifts text[];

alter table register4_config drop constraint if exists register4_config_shifts_valid;
alter table register4_config add constraint register4_config_shifts_valid
  check (shifts is null or shifts <@ array['am', 'mid', 'pm']::text[]);

-- Registers 1 and 2 open with the stand every period.
insert into register4_config (year, period, position, is_active, shifts)
select t.year, p.period, r.position, true, array['am','pm']
from tournament_settings t
cross join generate_series(0, 3) as p(period)
cross join (values ('register_1'), ('register_2')) as r(position)
on conflict (year, period, position) do update set shifts = excluded.shifts;

-- Register 3: the midday till in Week 1, a normal AM/PM till otherwise.
insert into register4_config (year, period, position, is_active, shifts)
select t.year, p.period, 'register_3', true,
       case when p.period = 1 then array['mid'] else array['am','pm'] end
from tournament_settings t
cross join generate_series(0, 3) as p(period)
on conflict (year, period, position) do update set shifts = excluded.shifts;

-- Register 4: closed in Week 1, the midday till from Week 2.
insert into register4_config (year, period, position, is_active, shifts)
select t.year, p.period, 'register_4',
       case when p.period = 1 then false else true end,
       case when p.period = 1 then array[]::text[] else array['mid'] end
from tournament_settings t
cross join generate_series(0, 3) as p(period)
on conflict (year, period, position) do update
  set shifts = excluded.shifts, is_active = excluded.is_active;

-- Prep 4 keeps the on/off switch; mirror it into shifts so both agree.
update register4_config
set shifts = case when is_active then array['am','pm'] else array[]::text[] end
where position = 'prep_4' and shifts is null;

-- Register assignments from the old shapes put people on tills that no longer
-- run those shifts. Clear the drafts so Auto-Schedule rebuilds them; anything
-- published is left alone.
delete from schedule_assignments
where location = 'food_village'
  and position like 'register_%'
  and status = 'draft';

commit;

notify pgrst, 'reload schema';
