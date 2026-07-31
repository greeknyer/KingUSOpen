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
in 7-day blocks. Opening hours are set per day per location, and the Food
Village's shift times live there too. Change the year and start date next
season and the whole app rolls over.

Two stands are scheduled:

- **Food Village** — 10 positions (Registers 1–4, Prep 1–4, Chef, Salads).
  Registers run three shifts a day — AM (10–4), MID (12–close) and PM (4–close) —
  so two people cover them through the peak. Prep and the kitchen run AM and PM
  only. Register 4 and Prep 4 switch on and off per period.
- **Stadium** — 2 positions (Register, Prep). Its shifts come from its own
  hours: one on a short or open-ended day, two on a long one. Closed days show
  as CLOSED.

Who can work where is per-employee: which positions they're qualified for,
which locations, which shifts on which days, and an optional cap on shifts per
week. Some staff work **full days**, holding a position open to close so its
later shifts need nobody.

Auto-Schedule respects all of it, staffs every position's opening shift before
anyone's handoff, and hands the longest shifts to whoever has fewest hours so
far to keep the week even. It reports slots it couldn't fill rather than
quietly leaving them.

Schedules are drafted, then **published**. Time Tracking starts each person from
what they were scheduled for and the manager corrects anyone who ran long or
short. Payroll Export produces the weekly Excel file.

## Routes

| Route | Purpose |
|---|---|
| `/login` | Manager sign-in (Supabase Auth) |
| `/dashboard` | Overview |
| `/dashboard/setup` | Year, Week 1 start, hours of operation, shift times, managers, Register 4 |
| `/dashboard/employees` | Staff roster |
| `/dashboard/availability` | Per-date exceptions to each person's weekly pattern |
| `/dashboard/schedule` | Assign positions and shift times; publish |
| `/dashboard/timetracking` | Clock-in / clock-out, prefilled from the schedule |
| `/dashboard/payroll` | Weekly Excel export |

Auth is enforced in [proxy.ts](proxy.ts) — every route except `/login` and
`/auth/callback` redirects to login without a session.
