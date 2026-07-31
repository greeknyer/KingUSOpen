# King US Open Scheduler — Setup Guide

## 1. Set up the Supabase database

1. Go to your Supabase project → **SQL Editor**
2. Open `supabase/schema.sql` and paste the entire contents
3. Click **Run** — creates all tables, policies, and indexes

## 2. Create a manager login

In Supabase → **Authentication → Users → Add user → Create new user**
Enter the manager's email and password. Done.

## 3. Set environment variables

The `.env.local` file already has the test credentials. For production, update:
```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

For Vercel: add both in Project → Settings → Environment Variables.

## 4. Run locally

```bash
npm install
npm run dev
```
Open http://localhost:3000 → redirected to login.

## 5. First steps after logging in

1. **Tournament Setup** → Enter the year and Week 1 start date (first Monday)
2. Configure which days the Stadium is open per period
3. Configure Register 4 active/inactive per period
4. **Employees** → Add all staff
5. **Availability** → Set who is available each day
6. **Schedule** → Auto-schedule or assign manually; Publish when done
7. **Time Tracking** → Enter daily clock-in/out during the tournament
8. **Payroll Export** → Download Excel report at end of each week

## App structure

### Periods
- **Pre-tournament** — setup days before Week 1 (configurable, default 3)
- **Week 1** — first 7 days of tournament
- **Week 2** — second 7 days
- **Week 3** — final 7 days

### Food Village positions (10 total)
- Register 1, 2, 3, 4 (Register 4 active/inactive is configurable per period)
- Prep 1, 2, 3, 4
- Chef
- Salads

Each position has **2 handoff slots per day** — Slot 1 = early shift, Slot 2 = late/handoff.
Click any cell in the schedule to assign an employee and time range.

### Stadium positions (2 total)
- Register (manager doubles as register worker)
- Prep

Stadium days shown as **CLOSED** on non-open days — configurable in Tournament Setup.

## Deploy to Vercel

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/king-usopen.git
git push -u origin main
```
Then import the repo in vercel.com and add environment variables.

## Annual reuse

Each year:
1. Go to Tournament Setup, change the year and start date
2. Stadium open days and Register 4 config will reset to defaults for the new year
3. Employee list carries over (just add new hires, deactivate leavers)
4. Availability and schedule are per-date so the new year starts fresh
