-- King US Open Scheduler — Database Schema
-- Run this in Supabase SQL Editor

-- Tournament settings (one per year)
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

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'crew' CHECK (role IN ('manager', 'crew')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Availability (per employee per date)
CREATE TABLE IF NOT EXISTS availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  available boolean NOT NULL DEFAULT true,
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

-- Row Level Security (authenticated users only)
ALTER TABLE tournament_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_open_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE register4_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON tournament_settings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON stadium_open_days FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON register4_config FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON employees FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON availability FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON schedule_assignments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON time_entries FOR ALL USING (auth.role() = 'authenticated');
