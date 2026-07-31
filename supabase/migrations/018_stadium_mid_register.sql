-- Migration 018 — The Stadium register as a single midday shift
--
-- Run this in the Supabase SQL Editor after 017_prep_period_shifts.sql.
--
-- The Stadium register is one person on the till for one shift, with no
-- handover — which is what MID means everywhere else in the app. It could not
-- be said there, because the Stadium read its slot 2 as the PM shift on the
-- grounds that it only ran two. Both locations now number slots the same way:
--
--   slot 1  AM   opens
--   slot 2  MID  a single shift, no handover
--   slot 3  PM   closes
--
-- So the Stadium's existing closing shift moves from slot 2 to slot 3, and a
-- new slot 2 is added for the register. Prep keeps opening and closing.
--
-- The MID shift is seeded to run the whole of the day's hours, since one person
-- covering the till has no one to hand over to. Times are clamped to each day's
-- real hours, so an evening-only day is covered from opening rather than from
-- 10am. Adjust them in Tournament Setup → Shift Times → Stadium.

begin;

-- Move the closing shift to slot 3 before inserting the new slot 2, or the
-- unique index on (year, location, slot_order) would collide.
update shift_templates
set slot_order = 3
where location = 'stadium' and slot_order = 2;

insert into shift_templates (year, location, section, slot_order, start_time, end_time)
select year, 'stadium', null, 2, '10:00'::time, null
from tournament_settings
on conflict do nothing;

-- Stadium slot 2 used to mean PM and now means MID, so anything drafted
-- against it is on the wrong shift. Published rows are left alone.
delete from schedule_assignments
where location = 'stadium' and status = 'draft';

commit;

notify pgrst, 'reload schema';
