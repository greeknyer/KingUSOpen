-- Migration 023 — The two accounts with full access
--
-- Run this in the Supabase SQL Editor after 022_inventory_access.sql.
--
-- 022 seeded the wrong address. Safe to run whether or not you already applied
-- 022 with it: this sets the list to exactly the two Supabase accounts that
-- should have full access, and removes anything else.
--
-- To add someone later:
--   insert into app_admins (email, note) values ('them@example.com', 'GM');
--
-- To take access away:
--   delete from app_admins where email = 'them@example.com';
--
-- The address must match the account's Supabase login exactly — the check reads
-- it from the signed-in user's token. Case doesn't matter.

begin;

insert into app_admins (email, note) values
  ('dev@kingusopen.com', 'Owner'),
  ('vivi2321@gmail.com', 'Owner')
on conflict (email) do update set note = excluded.note;

-- Anyone else who ended up on the list, including the address seeded in error.
delete from app_admins
where lower(email) not in ('dev@kingusopen.com', 'vivi2321@gmail.com');

commit;

notify pgrst, 'reload schema';
