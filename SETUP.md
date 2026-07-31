# King US Open Scheduler — Setup Guide

## 1. Set up the Supabase database

**A new database:** open `supabase/schema.sql`, paste the whole thing into
Supabase → **SQL Editor**, and Run. It creates every table, policy, index and
grant, and already includes everything the migrations add.

**An existing database:** run the files in `supabase/migrations/` in numerical
order, skipping any you have already applied. Each is idempotent, so re-running
one is harmless.

| Migration | Adds |
|---|---|
| `001_operating_hours` | per-day opening hours for both locations |
| `002_shift_templates` | the Food Village's AM / MID / PM shift times |
| `003_employee_skills` | skills, manager flag, designated managers |
| `004_employee_shifts_locations` | locations, weekly availability, weekly cap |
| `005_availability_shifts` | shift-level availability overrides |
| `006_full_day_staff` | staff who work open to close |
| `007_availability_full_day` | full days as a per-date override |
| `008_retire_prep_4` | removed Prep 4 — reinstated by 011, run it anyway to stay in order |
| `009_assignment_full_day` | marks assignments that hold a position all day |
| `010_availability_positions` | per-date restriction on which positions someone covers |
| `011_prep4_config` | Prep 4 back, switchable per period like Register 4 |
| `012_kitchen_shift_times` | the kitchen's own earlier shift times |
| `013_stadium_shift_times` | a set handover time for the Stadium |
| `014_register_times` | one person per register, staggered opening times |
| `015_register_period_shifts` | which shifts each register runs, per week |
| `016_guaranteed_days` | agreed days per week for returning staff |
| `017_prep_period_shifts` | which shifts each prep position runs, per week |
| `018_stadium_mid_register` | the Stadium register as a single midday shift |
| `019_stadium_mid_times` | that shift runs noon to 8pm |

> The grants at the end of `schema.sql` are load-bearing. PostgREST only exposes
> tables the API roles hold privileges on — without them every table returns
> `PGRST205: not found in schema cache` despite existing. They don't weaken
> security: the RLS policies still require an authenticated user.

## 2. Create a manager login

Supabase → **Authentication → Users → Add user → Create new user**. Enter the
manager's email and password. There is no self-service sign-up.

## 3. Set environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Both must come from the **same** Supabase project — a URL and key from different
projects fail with a 401 that looks like a login problem.

For Vercel: add both in Project → Settings → Environment Variables.

## 4. Run locally

```bash
npm install
npm run dev
```

## 5. First run, in order

Each step feeds the next, so it's worth doing them in this order.

1. **Tournament Setup** → year, the Monday Week 1 starts, pre-tournament days.
   Every date in the app derives from these. Also pick the **General Manager**
   and **Stadium Manager** here.
2. **Tournament Setup → Hours of Operation** → per-day opening hours for each
   location. Leave *Closes* blank for an open-ended day (Stadium 6pm → Close).
   *Apply to period* copies one day's hours across the week.
3. **Tournament Setup → Food Village Shift Times** → the AM / MID / PM windows.
4. **Employees** → for each person: positions, locations, weekly availability,
   max shifts per week, manager and full-day flags.
5. **Availability** → already filled in from each person's weekly pattern. Only
   touch dates that differ from their usual.
6. **Schedule** → Auto-Schedule a period, adjust by hand, then **Publish**.
7. **Time Tracking** → *Fill from schedule*, then correct anyone who ran long
   or short.
8. **Payroll Export** → weekly Excel file.

## How the app is put together

### Periods

Pre-tournament (configurable, default 3 days), then Weeks 1–3 of seven days
each. Everything counts from the Week 1 start date.

### Shifts

The Food Village runs three overlapping shifts every open day:

Every position is one person at a time. What differs is when each opens and
when it hands over:

| | Opens | Hands over | Runs to |
|---|---|---|---|
| Register 1, 2 | 10am | 5pm | close |
| Register 3 | 11am | 5pm | close |
| Register 4 | 12pm | — | 8pm (single MID shift) |
| Prep 1–4 | 10am | 4pm | close |
| Chef, Salads | 7am | 4pm | close |

A register that opens at noon is the **MID** shift — that is what mid means
here, not a second person on a till that is already staffed.

Each register's shifts are set per week in **Register Shifts by Week**, because
the shape changes: in Week 1 there are three tills and Register 3 is the midday
one, while from Week 2 there are four and Register 3 opens at 11am as a normal
AM/PM till. Ticking no shifts closes that till for the week. Times are editable
in Tournament Setup and clamped to each day's real hours, so a day opening late
moves its opening shift forward.

Prep works the same way, in **Prep Shifts by Week** — an AM prepper hands over
to a PM one, and Prep 4 only comes in for the busy weeks. Ticking no shifts
closes that position for the week, which is how Prep 4 is switched off, so a
position being closed is said one way rather than two.

Prep and the kitchen run AM and PM only — no mid. The kitchen also keeps its
own times, opening at 7am so food is ready for the doors, and stays at 7am even
on a day the stand opens late.

At the Stadium, **Prep** opens and closes with its own handover time, while the
**Register** is a single MID shift — one person on the till from 12pm to 8pm,
no handover, the same window as the Food Village's noon till. Adjust it in
**Tournament Setup → Shift Times → Stadium**.

Every set of times is clamped to the day it runs on, so a day opening late
starts late, and a day too short or running to an unknown close collapses to a
single shift — a 6pm-to-close evening stays one shift rather than being split.

### Positions

**Food Village (10)** — Register 1–4, Prep 1–4, Chef, Salads. Every register and
prep position is set per week, so Register 4 and Prep 4 run only the weeks you
give them shifts.
**Stadium (2)** — Register (a single MID shift, 12pm–8pm), Prep (AM and PM).

Each position requires a matching skill, so Auto-Schedule only places people
qualified for it.

### Who can work what

Each employee carries:

- **Positions** — Register / Prep / Chef / Salads, several per person
- **Locations** — Food Village, Stadium, or both
- **Weekly availability** — which shifts on each day of the week. Everything
  ticked is *Open*; empty weekends is *Mon–Fri*
- **Guaranteed days per week** — an agreed number, booked before anyone else
  shares what's left. Blank unless there's a deal
- **Max shifts per week** — a cap per period, blank for none
- **Manager** — MGR badge. Managers are the *fallback* everywhere, so they stay
  free to float, and the weekly cap doesn't apply to them
- **Works full days** — holds one position open to close, so that position
  needs nobody on its later shifts

The **Availability** screen fills itself in from the weekly pattern and stores
only exceptions, which are outlined in amber. A cell can set specific shifts or
a full day for one date.

### Managers

- **General Manager** — runs Food Village from **outside** the position grid, so
  all nine positions still need staffing. Shown as a banner on the schedule.
- **Stadium Manager** — fixed at the Stadium for the tournament, floats between
  Register and Prep, works open to close. Give them **no positions** and they
  supervise instead, sitting outside the grid like the GM.
- Anyone else with the manager flag is scheduled normally.

### How Auto-Schedule decides

1. The Stadium manager and any full-day staff take their positions first — each
   holds one position open to close, so its later shifts need nobody. Their
   hours are deliberately not levelled against everyone else's: working open to
   close, every open day, is the arrangement they're on.
2. Remaining slots are ordered by **coverage first** — every position's opening
   shift before anyone's handoff, so a short-staffed day loses mids rather than
   leaving a position with nobody to open it. Within a shift, the slot with
   **fewest people able to work it** goes first, so a scarce slot is filled
   while its few takers are still free.
3. Each slot goes to whoever is **owed days against an agreement**, then to
   whoever has **worked fewest hours**. That is what keeps hours even.
4. One exception: someone with only **one place in the whole day** — the chef,
   whose single skill is chef — keeps it rather than losing it to whoever is
   behind on hours. For them it isn't a fairness trade, it's not working at all.

Being available for more shifts never costs you work. An earlier version ranked
people by how boxed in they were before looking at hours, which left the most
flexible staff with the least work; hours do the balancing now.

Unfilled slots are reported back rather than passed over silently, and the
**Who's working** panel on the schedule shows each person's days, hours and the
reason they didn't get more.

`scripts/sim-fairness.ts` runs a week through the real scheduler and prints the
spread, for checking a change to any of this:

```bash
node --import ./scripts/ts-resolve.mjs --experimental-strip-types scripts/sim-fairness.ts
```

## Deploy to Vercel

Import the repo at vercel.com and add the two environment variables. Pushes to
`main` deploy automatically.

## Annual reuse

1. Tournament Setup → change the year and Week 1 start date
2. Re-check hours of operation and shift times for the new year
3. Employees carry over — add new hires, deactivate leavers, review each
   person's availability pattern
4. Availability, schedule and time entries are per-date, so the new year starts
   clean
