-- King US Open Scheduler — Database Schema
-- Run this in Supabase SQL Editor

-- Tournament settings (one per year)
-- general_manager_id runs Food Village and sits OUTSIDE the position grid.
-- stadium_manager_id is the one manager at the Stadium for the duration, and
-- floats between Register and Prep. Both work open to close on days their
-- location is open. Declared after employees exists — see the ALTER below.
CREATE TABLE IF NOT EXISTS tournament_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int UNIQUE NOT NULL,
  start_date date NOT NULL,         -- First day of Week 1 (a Monday)
  pre_tournament_days int NOT NULL DEFAULT 3,
  created_at timestamptz DEFAULT now()
);

-- Hours of operation, per location per day.
-- Per-day rather than per-period because the Stadium keeps different hours on
-- the first couple of days of a period. is_open false = closed that day
-- (the Stadium is dark on many days; Food Village is normally open).
-- close_time NULL = open-ended, displayed as "Close".
CREATE TABLE IF NOT EXISTS operating_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  location text NOT NULL CHECK (location IN ('food_village', 'stadium')),
  period int NOT NULL CHECK (period IN (0, 1, 2, 3)),  -- 0=pre, 1=w1, 2=w2, 3=w3
  day_index int NOT NULL,  -- index within the period (0..pre_days-1 or 0..6)
  is_open boolean NOT NULL DEFAULT true,
  open_time time,
  close_time time,
  created_at timestamptz DEFAULT now(),
  UNIQUE (year, location, period, day_index)
);

-- Register 4 active state per period
CREATE TABLE IF NOT EXISTS register4_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  period int NOT NULL CHECK (period IN (0, 1, 2, 3)),
  is_active boolean NOT NULL DEFAULT false,
  UNIQUE (year, period)
);

-- Shift templates. The Food Village runs three overlapping shifts every open
-- day (10am-4pm openers, 12pm-close mid, 4pm-close closers), so two people
-- cover each position from noon through the peak. end_time NULL = runs to that
-- day's close. The Stadium has no templates: its shift count is derived from
-- each day's hours instead (1 on a short or open-ended day, 2 on a long one).
CREATE TABLE IF NOT EXISTS shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  location text NOT NULL CHECK (location IN ('food_village', 'stadium')),
  slot_order int NOT NULL CHECK (slot_order IN (1, 2, 3)),
  start_time time NOT NULL,
  end_time time,
  created_at timestamptz DEFAULT now(),
  UNIQUE (year, location, slot_order)
);

-- Employees
-- skills lists the positions a person can actually work; Register, Prep, Chef
-- and Salads are distinct jobs and not everyone covers all of them. is_manager
-- is a flag on top rather than a position, so a manager still carries their own
-- skills while getting the MGR badge.
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  is_manager boolean NOT NULL DEFAULT false,
  skills text[] NOT NULL DEFAULT '{}'
    CHECK (skills <@ ARRAY['register', 'prep', 'chef', 'salads']::text[]),
  -- Which shift numbers this person can ever work. A standing preference, not
  -- per-day: the availability table still handles "off on Tuesday".
  shifts int[] NOT NULL DEFAULT '{1,2,3}'
    CHECK (shifts <@ ARRAY[1, 2, 3]),
  -- Some staff work the Stadium only, or Food Village only.
  locations text[] NOT NULL DEFAULT '{food_village,stadium}'
    CHECK (locations <@ ARRAY['food_village', 'stadium']::text[]),
  -- Works a position open to close rather than rotating through AM/MID/PM.
  -- That position then needs nobody on its later shifts.
  works_full_day boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Designated managers, added here because they reference employees.
ALTER TABLE tournament_settings
  ADD COLUMN IF NOT EXISTS general_manager_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE tournament_settings
  ADD COLUMN IF NOT EXISTS stadium_manager_id uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_skills ON employees USING gin (skills);
CREATE INDEX IF NOT EXISTS idx_employees_locations ON employees USING gin (locations);

-- Availability (per employee per date)
-- A row here is an EXCEPTION to the employee's standing weekly_availability
-- pattern, not the whole story. shifts says which shifts are workable on this
-- specific date: '{}' = off entirely, '{pm}' = PM only. NULL means available
-- for whatever the pattern already allows. No row at all = use the pattern.
CREATE TABLE IF NOT EXISTS availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  available boolean NOT NULL DEFAULT true,
  shifts text[] CHECK (shifts IS NULL OR shifts <@ ARRAY['am', 'mid', 'pm']::text[]),
  notes text,
  UNIQUE (employee_id, date)
);

-- Schedule assignments (each row = one handoff slot)
CREATE TABLE IF NOT EXISTS schedule_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  date date NOT NULL,
  location text NOT NULL CHECK (location IN ('food_village', 'stadium')),
  position text NOT NULL,
  slot_order int NOT NULL DEFAULT 1 CHECK (slot_order IN (1, 2, 3)),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  planned_start time,
  planned_end time,  -- NULL = 'close'
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz DEFAULT now()
);

-- Time entries (actual clock-in / clock-out)
CREATE TABLE IF NOT EXISTS time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  actual_in time,
  actual_out time,
  hours_calculated decimal(5,2),
  notes text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (employee_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_availability_employee ON availability(employee_id);
CREATE INDEX IF NOT EXISTS idx_availability_date ON availability(date);
CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule_assignments(date);
CREATE INDEX IF NOT EXISTS idx_schedule_year ON schedule_assignments(year);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_operating_hours_year ON operating_hours(year);
CREATE INDEX IF NOT EXISTS idx_operating_hours_lookup ON operating_hours(year, location, period, day_index);
CREATE INDEX IF NOT EXISTS idx_shift_templates_year ON shift_templates(year, location, slot_order);

-- Row Level Security (authenticated users only)
ALTER TABLE tournament_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE register4_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON tournament_settings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON operating_hours FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON shift_templates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON register4_config FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON employees FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON availability FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON schedule_assignments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON time_entries FOR ALL USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- API GRANTS
-- PostgREST only exposes tables the API roles hold privileges on — without
-- these, every table returns "PGRST205: not found in schema cache" even though
-- it exists. This does NOT weaken security: the RLS policies above still decide
-- which rows each role may touch, and they require an authenticated user.
-- Grants control reachability; RLS controls access.
-- ─────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Apply the same to anything created in this schema later.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO anon, authenticated, service_role;

-- Tell PostgREST to rebuild its schema cache so the tables appear immediately.
NOTIFY pgrst, 'reload schema';
