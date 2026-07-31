-- Migration 013 — Set shift times for the Stadium
--
-- Run this in the Supabase SQL Editor after 012_kitchen_shift_times.sql.
--
-- The Stadium had no shift templates: its two shifts were derived by halving
-- each day's opening hours. That kept the two shifts the same length, but put
-- the handover at whatever the midpoint happened to be — a day closing at 11pm
-- handed over at 4:30pm, one closing at 11:30pm at 4:45pm.
--
-- It now hands over at a set time like everywhere else. The times are clamped
-- to each day's hours, so a day opening late still starts late, and a day too
-- short or open-ended for two shifts collapses to one — a 6pm-to-close evening
-- stays a single shift rather than being split.

begin;

insert into shift_templates (year, location, section, slot_order, start_time, end_time)
select year, 'stadium', null, 1, '10:00'::time, '17:00'::time
from tournament_settings
on conflict do nothing;

insert into shift_templates (year, location, section, slot_order, start_time, end_time)
select year, 'stadium', null, 2, '17:00'::time, null
from tournament_settings
on conflict do nothing;

commit;

notify pgrst, 'reload schema';
