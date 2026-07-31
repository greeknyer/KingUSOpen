-- Migration 001 — Hours of operation for Food Village and Stadium
--
-- Run this in the Supabase SQL Editor if you have ALREADY run schema.sql.
-- A fresh database created from the current schema.sql does not need it.
--
-- Replaces stadium_open_days (which only recorded open/closed) with
-- operating_hours, which records open/closed AND the hours for both
-- locations, per day. Per-day rather than per-period because the Stadium
-- keeps different hours on the first couple of days of a period.
--
-- Existing stadium_open_days rows are copied across, so nothing is lost.
-- This migration does NOT drop the old table — see the final note.

begin;

create table if not exists operating_hours (
  id          uuid primary key default gen_random_uuid(),
  year        int  not null,
  location    text not null check (location in ('food_village', 'stadium')),
  period      int  not null check (period in (0, 1, 2, 3)),  -- 0=pre, 1..3=weeks
  day_index   int  not null,                                 -- index within the period
  is_open     boolean not null default true,
  open_time   time,
  close_time  time,        -- null = open-ended, shown as "Close"
  created_at  timestamptz default now(),
  unique (year, location, period, day_index)
);

-- Carry over the Stadium's existing open/closed flags, seeding the hours with
-- the values that were previously hardcoded in the auto-scheduler.
insert into operating_hours (year, location, period, day_index, is_open, open_time, close_time)
select year, 'stadium', period, day_index, is_open, '10:30'::time, '16:00'::time
from stadium_open_days
on conflict (year, location, period, day_index) do nothing;

-- Seed Food Village rows for every day the Stadium already knows about, so the
-- Setup screen has a full grid to edit rather than blanks.
insert into operating_hours (year, location, period, day_index, is_open, open_time, close_time)
select distinct year, 'food_village', period, day_index, true, '10:00'::time, '16:00'::time
from stadium_open_days
on conflict (year, location, period, day_index) do nothing;

alter table operating_hours enable row level security;

drop policy if exists "Authenticated full access" on operating_hours;
create policy "Authenticated full access" on operating_hours
  for all using (auth.role() = 'authenticated');

-- PostgREST only exposes tables the API roles hold privileges on.
grant all privileges on operating_hours to anon, authenticated, service_role;

create index if not exists idx_operating_hours_year on operating_hours(year);
create index if not exists idx_operating_hours_lookup
  on operating_hours(year, location, period, day_index);

commit;

-- Rebuild PostgREST's schema cache so the new table is reachable immediately.
notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────
-- stadium_open_days is intentionally left in place. Once you have opened
-- Tournament Setup and confirmed your Stadium open days and hours look right,
-- you can drop it:
--
--   drop table stadium_open_days;
--
-- Nothing in the app reads it after this migration.
-- ─────────────────────────────────────────────
