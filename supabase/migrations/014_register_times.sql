-- Migration 014 — One person per register, with staggered opening times
--
-- Run this in the Supabase SQL Editor after 013_stadium_shift_times.sql.
--
-- Registers were running three shifts each, which put up to three people on a
-- single till at once. A register is one person at a time; what actually varies
-- is when each till OPENS.
--
--   Register 1   AM 10:00-17:00   PM 17:00-close
--   Register 2   AM 10:00-17:00   PM 17:00-close
--   Register 3   AM 11:00-17:00   PM 17:00-close
--   Register 4   MID 12:00-20:00  (a single midday till)
--
-- Seven people across the day rather than twelve, and never two on one till.
-- The noon register is the MID shift — that is what "mid" meant here, not a
-- second person on a till that is already staffed.
--
-- shift_templates gains a `position` so a single register can override its
-- section's times, which is what lets Register 3 open an hour later.

begin;

alter table shift_templates
  add column if not exists position text;

drop index if exists shift_templates_section_key;
create unique index shift_templates_section_key
  on shift_templates (year, location, section, slot_order)
  where section is not null and position is null;

drop index if exists shift_templates_position_key;
create unique index shift_templates_position_key
  on shift_templates (year, location, position, slot_order)
  where position is not null;

-- Section-level times shared by every register.
insert into shift_templates (year, location, section, position, slot_order, start_time, end_time)
select year, 'food_village', 'Registers', null, 1, '10:00'::time, '17:00'::time from tournament_settings
on conflict do nothing;
insert into shift_templates (year, location, section, position, slot_order, start_time, end_time)
select year, 'food_village', 'Registers', null, 2, '12:00'::time, '20:00'::time from tournament_settings
on conflict do nothing;
insert into shift_templates (year, location, section, position, slot_order, start_time, end_time)
select year, 'food_village', 'Registers', null, 3, '17:00'::time, null from tournament_settings
on conflict do nothing;

-- Register 3 opens an hour after the others.
insert into shift_templates (year, location, section, position, slot_order, start_time, end_time)
select year, 'food_village', 'Registers', 'register_3', 1, '11:00'::time, '17:00'::time from tournament_settings
on conflict do nothing;

-- Assignments written under the old three-shifts-per-register model put more
-- than one person on a till. Clear the drafts so Auto-Schedule rebuilds them;
-- anything already published is left alone.
delete from schedule_assignments
where location = 'food_village'
  and position like 'register_%'
  and status = 'draft';

commit;

notify pgrst, 'reload schema';
