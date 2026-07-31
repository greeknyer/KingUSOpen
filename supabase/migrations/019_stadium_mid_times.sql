-- Migration 019 — The Stadium's midday shift runs noon to 8pm
--
-- Run this in the Supabase SQL Editor after 018_stadium_mid_register.sql.
--
-- 018 added the Stadium's MID slot but seeded it to span the whole of the day's
-- hours, which was a guess and the wrong one: on a 10am-to-11pm day that put
-- one person on the till for thirteen hours.
--
-- It is the same window as the Food Village's noon till — 12pm to 8pm — which
-- is a shift rather than a day. Times stay clamped to each day's real hours, so
-- an evening-only day still starts when the doors do.

begin;

update shift_templates
set start_time = '12:00'::time, end_time = '20:00'::time
where location = 'stadium' and slot_order = 2;

-- Insert it for any year that has no row yet, so a year set up between the two
-- migrations doesn't silently keep the old span.
insert into shift_templates (year, location, section, slot_order, start_time, end_time)
select year, 'stadium', null, 2, '12:00'::time, '20:00'::time
from tournament_settings
on conflict do nothing;

-- Drafts carry the times they were scheduled with, so anything already drafted
-- against the Stadium still reads 10am to close. Published rows are left alone.
delete from schedule_assignments
where location = 'stadium' and status = 'draft';

commit;

notify pgrst, 'reload schema';
