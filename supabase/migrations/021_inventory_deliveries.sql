-- Migration 021 — What the warehouse delivered
--
-- Run this in the Supabase SQL Editor after 020_product_sheet.sql.
--
-- The product sheet records what is LEFT at the end of a day. That is the
-- number the warehouse needs and the only one they are shown.
--
-- This is the other half, and it is ours: what arrived. Start with 20 lamb,
-- send 3 remaining that night, take another 10 in the morning — 30 have come
-- in over the tournament and 17 have gone out. Neither number can be worked out
-- from the sheet alone.
--
-- It lives on the existing counts row rather than in a table of its own, since
-- both are facts about one product on one day, and a delivery in the morning
-- and a count at night belong to the same date. Keeping the totals off the
-- product sheet screen is what stops them being photographed, not keeping them
-- in a separate table.

begin;

alter table inventory_counts
  add column if not exists delivered numeric(10, 2);

-- Day one's opening stock is a delivery like any other — it is how much of a
-- product the tournament has been given. NULL means nothing arrived that day,
-- which is different from a delivery of zero being recorded.
comment on column inventory_counts.delivered is
  'How many arrived that day, opening stock included. NULL = no delivery.';

commit;

notify pgrst, 'reload schema';
