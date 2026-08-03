-- Migration 022 — Total Inventory for named accounts only
--
-- Run this in the Supabase SQL Editor after 021_inventory_deliveries.sql.
--
-- ─────────────────────────────────────────────────────────────────
-- dev@kingusopen.com and vivi2321@gmail.com are seeded. Add anyone
-- else who should see the totals BEFORE running, or you will lock
-- them out of the screen.
-- ─────────────────────────────────────────────────────────────────
--
-- Deliveries and the totals drawn from them are not for everyone with a login.
-- Hiding the tab is not enough on its own: every signed-in user holds a token
-- that can query the API directly, so whatever the screen doesn't show is still
-- one request away. The restriction has to be in the database.
--
-- Row security works per ROW, and `delivered` sat on the same row as `on_hand`
-- — which the product sheet needs everyone to read. There is no way to hide one
-- column of a row from a user who may read the rest, so deliveries move into a
-- table of their own that named accounts alone can touch.
--
-- Counts stay open to every signed-in user, so the product sheet is unaffected.

begin;

create table if not exists app_admins (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

-- The two accounts with full access. Add a row per person who should see the
-- totals:
--   insert into app_admins (email, note) values ('someone@example.com', 'GM');
insert into app_admins (email, note) values
  ('dev@kingusopen.com', 'Owner'),
  ('vivi2321@gmail.com', 'Owner')
on conflict (email) do nothing;

/*
 * Whether the signed-in account may see deliveries.
 *
 * SECURITY DEFINER so the check can read app_admins while that table stays
 * unreadable through the API — otherwise the policy would need to expose the
 * list of privileged addresses to the very users it exists to exclude.
 */
create or replace function is_inventory_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from app_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists inventory_deliveries (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  date date not null,
  item_id uuid not null references inventory_items (id) on delete cascade,
  -- How many arrived that day, opening stock included.
  quantity numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, item_id)
);

create index if not exists idx_inventory_deliveries_item on inventory_deliveries (item_id);

-- Carry across anything already recorded under 021, then retire the column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'inventory_counts' and column_name = 'delivered'
  ) then
    insert into inventory_deliveries (year, date, item_id, quantity)
    select year, date, item_id, delivered
    from inventory_counts
    where delivered is not null
    on conflict (date, item_id) do update set quantity = excluded.quantity;

    alter table inventory_counts drop column delivered;
  end if;
end $$;

alter table app_admins           enable row level security;
alter table inventory_deliveries enable row level security;

-- app_admins gets NO policy: it is readable only by the SECURITY DEFINER
-- function above and by service_role. Manage it here in the SQL editor.
drop policy if exists "Inventory admins only" on inventory_deliveries;
create policy "Inventory admins only" on inventory_deliveries
  for all using (is_inventory_admin()) with check (is_inventory_admin());

grant all privileges on table inventory_deliveries to anon, authenticated, service_role;
grant execute on function is_inventory_admin() to anon, authenticated, service_role;
-- Deliberately no grant on app_admins to anon/authenticated.

commit;

notify pgrst, 'reload schema';
