-- Migration 012 — Separate shift times for the kitchen
--
-- Run this in the Supabase SQL Editor after 011_prep4_config.sql.
--
-- The kitchen opens before the stand does — the chef is in at 7am to have food
-- ready for a 10am open — so it cannot share the registers' shift times.
--
-- shift_templates gains a `section`, matching the section a position belongs to
-- (Registers, Prep, Kitchen). A row with section NULL is the default that any
-- position without its own times uses, so only the kitchen needs its own.
--
--   section NULL       AM 10:00-16:00, MID 12:00-close, PM 16:00-close
--   section 'Kitchen'  AM 07:00-16:00,                  PM 16:00-close
--
-- Existing rows keep section NULL and stay the default, so nothing that is
-- already configured changes.

begin;

alter table shift_templates
  add column if not exists section text;

-- The old key was (year, location, slot_order); it now has to include section.
-- NULLs don't collide under a plain unique constraint, so the default rows are
-- keyed separately by a partial index.
alter table shift_templates drop constraint if exists shift_templates_year_location_slot_order_key;

drop index if exists shift_templates_default_key;
create unique index shift_templates_default_key
  on shift_templates (year, location, slot_order)
  where section is null;

drop index if exists shift_templates_section_key;
create unique index shift_templates_section_key
  on shift_templates (year, location, section, slot_order)
  where section is not null;

-- Seed the kitchen: in at 7am, handing over at 4pm.
insert into shift_templates (year, location, section, slot_order, start_time, end_time)
select year, 'food_village', 'Kitchen', 1, '07:00'::time, '16:00'::time
from tournament_settings
on conflict do nothing;

insert into shift_templates (year, location, section, slot_order, start_time, end_time)
select year, 'food_village', 'Kitchen', 3, '16:00'::time, null
from tournament_settings
on conflict do nothing;

commit;

notify pgrst, 'reload schema';
