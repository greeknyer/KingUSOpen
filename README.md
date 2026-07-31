# King US Open Scheduler

Staff scheduling, time tracking, and payroll export for King Souvlaki's US Open
operation — the Food Village stand and the Stadium stand — across the
pre-tournament setup days and the three tournament weeks.

Separate from the year-round [king-scheduler](https://github.com/greeknyer/kingsouvlaki)
app: that one handles trucks and events, this one handles the tournament.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- Supabase (Postgres + Auth), accessed via `@supabase/ssr`
- Tailwind CSS 4
- `xlsx` for the payroll export

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

Requires `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Both values must come from the **same** Supabase project — a URL and key from
different projects fail with a 401 that looks like a login problem.

See [SETUP.md](SETUP.md) for database setup, creating the manager login,
deploying to Vercel, and reusing the app in later years.

## How it works

Everything hangs off **Tournament Setup**: enter the year and the Monday that
Week 1 starts, and every date in the app is derived from it — the
pre-tournament days count backwards from that Monday, and Weeks 1–3 run forward
in 7-day blocks. Change those two fields next year and the whole app rolls over.

Two stands are scheduled:

- **Food Village** — 10 positions (Registers 1–4, Prep 1–4, Chef, Salads), each
  with 2 handoff slots per day. Register 4 can be switched on or off per period.
- **Stadium** — 2 positions (Register, Prep). Days the Stadium isn't open show
  as CLOSED; open days are configured per period.

Schedules are drafted, then **published**. During the tournament, daily
clock-in/out goes into Time Tracking, and Payroll Export produces the weekly
Excel file.

## Routes

| Route | Purpose |
|---|---|
| `/login` | Manager sign-in (Supabase Auth) |
| `/dashboard` | Overview |
| `/dashboard/setup` | Year, Week 1 start, Stadium open days, Register 4 |
| `/dashboard/employees` | Staff roster |
| `/dashboard/availability` | Who can work which day |
| `/dashboard/schedule` | Assign positions and shift times; publish |
| `/dashboard/timetracking` | Actual clock-in / clock-out |
| `/dashboard/payroll` | Weekly Excel export |

Auth is enforced in [proxy.ts](proxy.ts) — every route except `/login` and
`/auth/callback` redirects to login without a session.
