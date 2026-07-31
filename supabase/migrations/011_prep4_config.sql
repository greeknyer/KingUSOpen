-- Migration 011 — Prep 4, switchable per period like Register 4
--
-- Run this in the Supabase SQL Editor after 010_availability_positions.sql.
--
-- Prep 4 comes back as a fourth prep position, but it isn't used every week —
-- off for Week 1, on for Week 2 and Week 3. That is exactly how Register 4
-- already works, so it reuses the same table rather than inventing a parallel
-- one: a `position` column turns register4_config into a per-period switch for
-- any optional position.
--
-- Existing rows are Register 4 by default, so the arrangement already set for
-- it carries over untouched. Prep 4 starts off in every period.

begin;

alter table register4_config
  add column if not exists position text not null default 'register_4';

-- The old key was (year, period); it now has to include the position.
alter table register4_config drop constraint if exists register4_config_year_period_key;
alter table register4_config drop constraint if exists register4_config_year_period_position_key;
alter table register4_config
  add constraint register4_config_year_period_position_key unique (year, period, position);

-- Prep 4 off everywhere to begin with; turn on the periods it runs.
insert into register4_config (year, period, position, is_active)
select t.year, p.period, 'prep_4', false
from tournament_settings t
cross join generate_series(0, 3) as p(period)
on conflict (year, period, position) do nothing;

commit;

notify pgrst, 'reload schema';
