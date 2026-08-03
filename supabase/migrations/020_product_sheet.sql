-- Migration 020 — Product sheets
--
-- Run this in the Supabase SQL Editor after 019_stadium_mid_times.sql.
--
-- What each stand has left at the end of a day, so the warehouse knows what to
-- send the next morning. One sheet per location: 36 lines at the Food Village,
-- 21 at the Stadium.
--
-- Two tables, because the list of products and the counting of them change at
-- completely different rates. The list is set once for the tournament; the
-- counts happen every night. Keeping them apart also means renaming a product
-- doesn't disturb any count already taken against it.
--
--   inventory_items   the products a location stocks, in the order they are
--                     counted — which is walking order round the stand, not
--                     alphabetical, so the sheet matches the shelves
--
--   inventory_counts  how many of one product were left on one date
--
-- Counts are numeric rather than integer: half a case is a real answer.
--
-- No items are seeded. The names are yours and the screen has an editor for
-- entering them, including pasting the whole list at once.

begin;

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  location text not null check (location in ('food_village', 'stadium')),
  name text not null,
  -- What one counts: 'case', 'box', 'bag'. Optional — plenty of things are
  -- just a number.
  unit text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_items_lookup
  on inventory_items (year, location, sort_order);

create table if not exists inventory_counts (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  date date not null,
  item_id uuid not null references inventory_items (id) on delete cascade,
  -- What is left on the shelf. NULL means not counted yet, which is different
  -- from a counted zero — one is a gap in the sheet, the other is an order.
  on_hand numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, item_id)
);

create index if not exists idx_inventory_counts_date on inventory_counts (date);

alter table inventory_items  enable row level security;
alter table inventory_counts enable row level security;

drop policy if exists "Authenticated full access" on inventory_items;
drop policy if exists "Authenticated full access" on inventory_counts;
create policy "Authenticated full access" on inventory_items  for all using (auth.role() = 'authenticated');
create policy "Authenticated full access" on inventory_counts for all using (auth.role() = 'authenticated');

-- PostgREST only exposes tables the API roles hold privileges on. Without this
-- both tables return PGRST205 "not found in schema cache" despite existing.
grant all privileges on table inventory_items  to anon, authenticated, service_role;
grant all privileges on table inventory_counts to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
