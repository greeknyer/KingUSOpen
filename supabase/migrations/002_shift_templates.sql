-- Migration 002 — Configurable shift times for the Food Village
--
-- Run this in the Supabase SQL Editor after 001_operating_hours.sql.
--
-- The Food Village runs three overlapping shifts every open day:
--
--   #1  10am → 4pm      openers, hands off to #3
--   #2  12pm → Close    mid, overlaps both
--   #3  4pm  → Close    closers
--
-- Two people per position are on from 12pm, which is what staffs all four
-- registers through the afternoon-into-evening peak.
--
-- These are templates rather than fixed times so next year's hours can change
-- without a code edit, and so a day that opens at an unusual hour still works
-- (the app clamps a template to that day's actual opening hours).
--
-- The Stadium is deliberately absent: its shift count is derived from each
-- day's hours instead (1 shift on a short or open-ended day, 2 on a long one),
-- so it needs no templates. The table allows them if that ever changes.

begin;

create table if not exists shift_templates (
  id          uuid primary key default gen_random_uuid(),
  year        int  not null,
  location    text not null check (location in ('food_village', 'stadium')),
  slot_order  int  not null check (slot_order in (1, 2, 3)),
  start_time  time not null,
  end_time    time,        -- null = runs until that day's close ("Close")
  created_at  timestamptz default now(),
  unique (year, location, slot_order)
);

-- Seed the Food Village's three shifts for every year already configured.
insert into shift_templates (year, location, slot_order, start_time, end_time)
select year, 'food_village', 1, '10:00'::time, '16:00'::time from tournament_settings
on conflict (year, location, slot_order) do nothing;

insert into shift_templates (year, location, slot_order, start_time, end_time)
select year, 'food_village', 2, '12:00'::time, null from tournament_settings
on conflict (year, location, slot_order) do nothing;

insert into shift_templates (year, location, slot_order, start_time, end_time)
select year, 'food_village', 3, '16:00'::time, null from tournament_settings
on conflict (year, location, slot_order) do nothing;

alter table shift_templates enable row level security;

drop policy if exists "Authenticated full access" on shift_templates;
create policy "Authenticated full access" on shift_templates
  for all using (auth.role() = 'authenticated');

-- PostgREST only exposes tables the API roles hold privileges on.
grant all privileges on shift_templates to anon, authenticated, service_role;

create index if not exists idx_shift_templates_year on shift_templates(year, location, slot_order);

commit;

notify pgrst, 'reload schema';
