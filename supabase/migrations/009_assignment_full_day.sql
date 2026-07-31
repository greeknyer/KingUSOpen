-- Migration 009 — Mark assignments that span the whole day
--
-- Run this in the Supabase SQL Editor after 008_retire_prep_4.sql.
--
-- When one person holds a position from open to close, that position's later
-- shifts need nobody. The schedule grid had no way to know that, so it drew
-- those rows as empty cells — indistinguishable from a genuine gap, and the
-- main thing making it hard to see what is actually unstaffed.
--
-- is_full_day marks the assignment as covering the position for the day, so the
-- grid can show the remaining rows as covered rather than missing.
--
-- Existing rows default to false. Re-running Auto-Schedule sets it correctly;
-- until then a previously scheduled full day will still show its later rows as
-- gaps, which is the old behaviour rather than a new problem.

begin;

alter table schedule_assignments
  add column if not exists is_full_day boolean not null default false;

commit;

notify pgrst, 'reload schema';
