-- Migration 010 — Restrict which positions someone covers on a given date
--
-- Run this in the Supabase SQL Editor after 009_assignment_full_day.sql.
--
-- employees.skills says what a person is qualified for, which is a standing
-- fact. Which of those they actually cover can vary by day: someone qualified
-- for both Prep and Salads may be the salads cover on Mondays and Saturdays,
-- and must not be pulled onto prep those days.
--
-- It also shifts across the tournament — a pattern that holds for Weeks 1 and 2
-- can become near-permanent in Week 3 — so this is per date rather than a fixed
-- weekly shape, which would not survive that change.
--
--   NULL          any position they're qualified for
--   '{salads}'    salads only that date, even though they can also prep
--
-- Always a subset of their skills: this narrows what someone covers, it never
-- qualifies them for something they can't do.

begin;

alter table availability
  add column if not exists positions text[];

alter table availability drop constraint if exists availability_positions_valid;
alter table availability add constraint availability_positions_valid
  check (positions is null or positions <@ array['register', 'prep', 'chef', 'salads']::text[]);

commit;

notify pgrst, 'reload schema';
