-- Migration 017 — Which shifts each prep position runs, per period
--
-- Run this in the Supabase SQL Editor after 016_guaranteed_days.sql.
--
-- Prep now works the way the registers do. Registers gained per-period shifts
-- in 015, so a till can be the midday one in Week 1 and a normal AM/PM till in
-- Week 2, or be closed for a period entirely. Prep had none of that: the four
-- positions ran a fixed AM/PM every week, and Prep 4 was switched on and off
-- through Optional Positions, which is a second way of saying the same thing.
--
--   shifts = '{am,pm}'   opens and closes, handing over once
--   shifts = '{mid}'     a single midday prepper
--   shifts = '{}'        that prep position is closed for the period
--   no row               use the position's default
--
-- Empty shifts replaces is_active for prep as it did for the registers, so a
-- position being closed is said one way. Prep 4's on/off setting is carried
-- across rather than reset, so the weeks already arranged for it stay as they
-- are: 015 mirrored is_active into shifts, and this keeps the two in step.
--
-- Prep 1 to 3 are seeded with the AM/PM they already ran, so no schedule that
-- exists changes and no draft needs clearing.

begin;

-- Prep 1 to 3 open and close every period, which is what they already did.
insert into register4_config (year, period, position, is_active, shifts)
select t.year, p.period, r.position, true, array['am','pm']
from tournament_settings t
cross join generate_series(0, 3) as p(period)
cross join (values ('prep_1'), ('prep_2'), ('prep_3')) as r(position)
on conflict (year, period, position) do update set shifts = excluded.shifts;

-- Prep 4 keeps whichever periods it was already switched on for.
insert into register4_config (year, period, position, is_active, shifts)
select t.year, p.period, 'prep_4', false, array[]::text[]
from tournament_settings t
cross join generate_series(0, 3) as p(period)
on conflict (year, period, position) do nothing;

update register4_config
set shifts = case when is_active then array['am','pm'] else array[]::text[] end
where position = 'prep_4' and shifts is null;

-- is_active and shifts must agree, since the app now reads shifts alone.
update register4_config
set is_active = (coalesce(array_length(shifts, 1), 0) > 0)
where position like 'prep_%' and shifts is not null;

commit;

notify pgrst, 'reload schema';
