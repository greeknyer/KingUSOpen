'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  Employee, FOOD_VILLAGE_POSITIONS, STADIUM_POSITIONS, TournamentSettings,
  OperatingHours, Location, buildHoursMap, getHoursForDate, shiftLengthHours,
  ShiftTemplate, shiftsForDay, canWork, canWorkOn, canWorkLocation, Position,
  Availability, availableShiftsOn, worksFullDayOn, shiftPeriodFor, positionRunsSlot,
  ShiftPeriod,
} from '@/lib/types'
import { SHIFT_PRIORITY, pickBest, meanLength } from '@/lib/scheduling'

export async function autoSchedulePeriod(
  dates: string[],
  year: number,
  /** Dates each optional position runs, keyed by position id. */
  activeDates: Record<string, string[]>
) {
  const supabase = await createClient()

  // Clear existing drafts for these dates
  await supabase
    .from('schedule_assignments')
    .delete()
    .in('date', dates)
    .eq('status', 'draft')

  // Load employees, availability, and the hours that define each day's shifts.
  const [
    { data: employees }, { data: avails }, { data: settingsRows },
    { data: hoursRows }, { data: templateRows },
  ] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true),
      supabase.from('availability').select('*').in('date', dates),
      supabase.from('tournament_settings').select('*').eq('year', year).limit(1),
      supabase.from('operating_hours').select('*').eq('year', year),
      supabase.from('shift_templates').select('*').eq('year', year),
    ])

  if (!employees || employees.length === 0) return { count: 0, unfilled: 0 }

  const settings: TournamentSettings | undefined = settingsRows?.[0]
  if (!settings) return { count: 0, unfilled: 0 }

  // Non-null past the guard above; named so the closures below don't re-narrow.
  const staff: Employee[] = employees

  const hoursMap = buildHoursMap((hoursRows ?? []) as OperatingHours[])

  const templates = (templateRows ?? []) as ShiftTemplate[]

  /**
   * The shifts to staff for a location on a date. Food Village resolves its
   * three templates against the day's hours; the Stadium splits its hours,
   * giving one shift on a short or open-ended day and two on a long one.
   */
  function shiftsFor(location: Location, date: string) {
    const h = getHoursForDate(hoursMap, location, date, settings!)
    if (!h) return []
    return shiftsForDay(location, h, templates)
  }

  // Per-date overrides. Absent means "use the employee's weekly pattern".
  const availMap = new Map<string, Availability>()
  ;(avails ?? []).forEach((a: Availability) =>
    availMap.set(`${a.employee_id}:${a.date}`, a)
  )

  /**
   * The shifts someone can actually work on a date — their standing weekly
   * pattern unless an override for that date says otherwise. Shared with the
   * Availability grid so the two can't disagree about who is on.
   */
  function shiftsAvailable(e: Employee, date: string) {
    return availableShiftsOn(e, date, availMap.get(`${e.id}:${date}`))
  }

  /** Full days can be set per date, so read that rather than the employee flag. */
  function isFullDay(e: Employee, date: string) {
    return worksFullDayOn(e, date, availMap.get(`${e.id}:${date}`))
  }

  /** Working at all that date, whatever the shift. */
  function isAvail(empId: string, date: string): boolean {
    const e = staff.find((x: Employee) => x.id === empId)
    return e ? shiftsAvailable(e, date).length > 0 : false
  }

  /** Skill and location are standing facts; the shift comes from the date. */
  function eligibleFor(
    e: Employee,
    position: Position,
    location: Location,
    slotOrder: number,
    date: string
  ): boolean {
    if (!canWorkOn(e, position, availMap.get(`${e.id}:${date}`))) return false
    if (!canWorkLocation(e, location)) return false
    return shiftsAvailable(e, date).includes(shiftPeriodFor(location, slotOrder))
  }

  // Track hours assigned per employee (for fair distribution). Named apart from
  // the operating-hours map above, which is a different thing entirely.
  const hoursTally = new Map<string, number>(employees.map((e: Employee) => [e.id, 0]))

  const assignments: object[] = []
  let unfilled = 0

  // Shifts given to each employee across this period. max_shifts_per_week caps
  // it, so a part-timer stays capped however short-staffed the week gets.
  const periodShifts = new Map<string, number>()

  function underCap(e: Employee): boolean {
    // Managers aren't capped — they work the hours they have, and the weekly
    // limit exists to hold regular staff to agreed hours, not to bench a
    // manager mid-tournament.
    if (e.is_manager) return true
    const cap = e.max_shifts_per_week
    if (cap == null) return true
    return (periodShifts.get(e.id) ?? 0) < cap
  }

  function recordShift(id: string) {
    periodShifts.set(id, (periodShifts.get(id) ?? 0) + 1)
  }

  // Designated managers are fixed for the tournament and never enter the
  // general pool: the GM runs Food Village from outside the position grid, and
  // the Stadium manager is always at the Stadium.
  const gmId = settings.general_manager_id
  const stadiumManagerId = settings.stadium_manager_id
  const stadiumManager = employees.find((e: Employee) => e.id === stadiumManagerId)

  for (const date of dates) {
    const availableEmps = employees.filter(
      (e: Employee) => isAvail(e.id, date) && e.id !== gmId && e.id !== stadiumManagerId
    )

    // Optional positions only run on the days they're switched on for.
    const fvPositions = FOOD_VILLAGE_POSITIONS.filter(p =>
      p.configurable ? (activeDates[p.id] ?? []).includes(date) : true
    )

    const fvShifts = shiftsFor('food_village', date)
    const stadiumShifts = shiftsFor('stadium', date)

    // Build the day's slots ordered by shift first, then location, then
    // position. Ordering by shift matters when staff is tight: it covers every
    // position's opening shift before staffing anyone's handoff, rather than
    // fully staffing a few positions and leaving others dark all day.
    type Slot = {
      location: Location
      position: string
      isChef: boolean
      slotOrder: number
      start: string
      end: string | null
    }
    const slots: Slot[] = []

    // Built in operational priority — see SHIFT_PRIORITY. Slots are filled in
    // this same order, so a short day loses mids rather than leaving a position
    // with nobody to open it.
    for (const period of SHIFT_PRIORITY) {
      const fv = fvShifts.find(s => shiftPeriodFor('food_village', s.slot_order) === period)
      if (fv) {
        for (const pos of fvPositions) {
          // Not every position runs every shift — the kitchen has no mid.
          if (!positionRunsSlot('food_village', pos.id, fv.slot_order)) continue
          slots.push({
            location: 'food_village',
            position: pos.id,
            isChef: pos.id === 'chef',
            slotOrder: fv.slot_order,
            start: fv.start,
            end: fv.end,
          })
        }
      }
      const st = stadiumShifts.find(s => shiftPeriodFor('stadium', s.slot_order) === period)
      if (st) {
        for (const pos of STADIUM_POSITIONS) {
          if (!positionRunsSlot('stadium', pos.id, st.slot_order)) continue
          slots.push({
            location: 'stadium',
            position: pos.id,
            isChef: false,
            slotOrder: st.slot_order,
            start: st.start,
            end: st.end,
          })
        }
      }
    }

    // One shift per employee per day — a handoff needs a second person.
    const assignedToday = new Set<string>()

    // Positions held open-to-close by one person, so their later shifts need
    // nobody. Keyed `${location}:${position}`.
    const coveredPositions = new Set<string>()

    /** Give someone a position for the whole of that location's opening hours. */
    function assignFullDay(e: Employee, location: Location, position: string, fallback: string) {
      const h = getHoursForDate(hoursMap, location, date, settings!)
      assignments.push({
        year,
        date,
        location,
        position,
        slot_order: 1,
        employee_id: e.id,
        planned_start: h?.open_time ?? fallback,
        planned_end: h?.close_time ?? null,
        is_full_day: true,
        status: 'draft',
      })
      assignedToday.add(e.id)
      recordShift(e.id)
      coveredPositions.add(`${location}:${position}`)
      hoursTally.set(
        e.id,
        (hoursTally.get(e.id) ?? 0) +
          shiftLengthHours(h?.open_time ?? null, h?.close_time ?? null)
      )
    }

    // Pin the Stadium manager first — they're fixed at the Stadium for the
    // tournament and float between Register and Prep.
    if (
      stadiumManager &&
      stadiumShifts.length > 0 &&
      isAvail(stadiumManager.id, date) &&
      canWorkLocation(stadiumManager, 'stadium')
    ) {
      const pos =
        STADIUM_POSITIONS.find(p => canWork(stadiumManager, p.id)) ?? STADIUM_POSITIONS[0]
      assignFullDay(stadiumManager, 'stadium', pos.id, stadiumShifts[0].start)
    }

    // Then anyone who works full days. They take a position outright, which is
    // why they're placed before the shift rotation — every position they hold
    // is one fewer that needs three people cycling through it.
    const fullDayCandidates: { location: Location; position: string }[] = [
      ...(fvShifts.length > 0
        ? fvPositions.map(p => ({ location: 'food_village' as Location, position: p.id }))
        : []),
      ...(stadiumShifts.length > 0
        ? STADIUM_POSITIONS.map(p => ({ location: 'stadium' as Location, position: p.id }))
        : []),
    ]

    /**
     * Whether someone is free for every shift a location runs that day.
     *
     * Working full days is a standing arrangement, but availability is per day:
     * someone on full days at weekends may only be free for the PM shift midweek.
     * Handing them open-to-close then both schedules them outside their hours and
     * locks up the whole position — with only three prep positions, three full-day
     * preppers is the entire prep crew for the day. They take a normal shift on
     * those days instead, leaving the position's other shifts for someone else.
     */
    function freeAllDay(e: Employee, location: Location): boolean {
      const dayShifts = location === 'food_village' ? fvShifts : stadiumShifts
      if (dayShifts.length === 0) return false
      const avail = shiftsAvailable(e, date)
      return dayShifts.every(s => avail.includes(shiftPeriodFor(location, s.slot_order)))
    }

    const fullDayStaff = availableEmps
      .filter((e: Employee) => isFullDay(e, date) && !assignedToday.has(e.id) && underCap(e))
      .sort((a: Employee, b: Employee) =>
        (hoursTally.get(a.id) ?? 0) - (hoursTally.get(b.id) ?? 0)
      )

    for (const e of fullDayStaff) {
      const target = fullDayCandidates.find(
        c =>
          !coveredPositions.has(`${c.location}:${c.position}`) &&
          canWorkOn(e, c.position as Position, availMap.get(`${e.id}:${date}`)) &&
          canWorkLocation(e, c.location) &&
          freeAllDay(e, c.location)
      )
      // No free position they can work — they fall through to the normal
      // rotation below rather than being left off the day entirely.
      if (!target) continue
      const first = target.location === 'food_village' ? fvShifts[0] : stadiumShifts[0]
      assignFullDay(e, target.location, target.position, first.start)
    }

    /**
     * How many of the day's shifts this person could take at a location.
     *
     * Someone available only for PM has exactly one way to be used. If a fully
     * flexible colleague takes that PM slot first, the PM-only person cannot be
     * placed at all and the shift they could have covered goes empty — which is
     * how a PM-only prepper ends up missing from a day while AM sits unfilled.
     * Preferring the most constrained person for each slot keeps the flexible
     * ones free for the slots only they can still fill.
     */
    function shiftOptions(e: Employee, location: Location): number {
      const dayShifts = location === 'food_village' ? fvShifts : stadiumShifts
      const avail = shiftsAvailable(e, date)
      return dayShifts.filter(s => avail.includes(shiftPeriodFor(location, s.slot_order))).length
    }

    /** Mean shift length that day, so the picker can tell long from short. */
    function meanFor(location: Location) {
      const dayShifts = location === 'food_village' ? fvShifts : stadiumShifts
      return meanLength(dayShifts.map(s => shiftLengthHours(s.start, s.end)))
    }

    function pickOrder(location: Location, slotLength: number) {
      return pickBest({
        shiftOptions: (e: Employee) => shiftOptions(e, location),
        hours: (e: Employee) => hoursTally.get(e.id) ?? 0,
        slotLength,
        meanShiftLength: meanFor(location),
      })
    }

    // Coverage decides WHICH slots get staffed; fairness decides WHO fills
    // them. Both passes are needed because the two goals pull apart.
    //
    // Pass 1 walks the slots in coverage order — every position's opening
    // shift before anyone's handoff — consuming one eligible person per slot
    // to work out how many are actually staffable today.
    const openSlots = slots.filter(
      s => !coveredPositions.has(`${s.location}:${s.position}`)
    )
    const unclaimed = new Set(
      availableEmps.filter((e: Employee) => !assignedToday.has(e.id)).map((e: Employee) => e.id)
    )
    const staffable: typeof openSlots = []
    for (const slot of openSlots) {
      const candidate = [...availableEmps]
        .sort(pickOrder(slot.location, shiftLengthHours(slot.start, slot.end)))
        .find(
          (e: Employee) =>
            unclaimed.has(e.id) &&
            eligibleFor(e, slot.position as Position, slot.location, slot.slotOrder, date) &&
            underCap(e)
        )
      if (!candidate) continue
      unclaimed.delete(candidate.id)
      staffable.push(slot)
    }

    // Slots pass 1 could not staff at all — nobody eligible left, or everyone
    // who was is already at their weekly cap.
    unfilled += openSlots.length - staffable.length

    // Pass 2 fills them in the same operational priority pass 1 used, so opens
    // and closes are staffed before mids and the two passes agree on order.
    // Balance is handled by the picker instead: a longer-than-average shift
    // goes to whoever has worked least and a shorter one to whoever has worked
    // most, which rotates people through shift types rather than pinning them.
    for (const slot of staffable) {

      // Fewest hours so far goes next. Only people qualified for the position
      // are eligible; Chef prefers a manager among those who can actually cook.
      const eligible = availableEmps
        .filter((e: Employee) =>
          eligibleFor(e, slot.position as Position, slot.location, slot.slotOrder, date) &&
          underCap(e)
        )
        .sort(pickOrder(slot.location, shiftLengthHours(slot.start, slot.end)))
      const pool = slot.isChef
        ? [...eligible.filter(e => e.is_manager), ...eligible.filter(e => !e.is_manager)]
        : [...eligible.filter(e => !e.is_manager), ...eligible.filter(e => e.is_manager)]

      const emp = pool.find(e => !assignedToday.has(e.id))
      if (!emp) {
        unfilled++
        continue
      }

      assignments.push({
        year,
        date,
        location: slot.location,
        position: slot.position,
        slot_order: slot.slotOrder,
        employee_id: emp.id,
        planned_start: slot.start,
        planned_end: slot.end,
        // Written explicitly even though it's the default: PostgREST rejects a
        // bulk insert whose objects don't all carry the same keys.
        is_full_day: false,
        status: 'draft',
      })
      assignedToday.add(emp.id)
      recordShift(emp.id)
      hoursTally.set(
        emp.id,
        (hoursTally.get(emp.id) ?? 0) + shiftLengthHours(slot.start, slot.end)
      )
    }
  }

  // The count above is what we intended to write; only a clean insert makes it
  // what was actually written. Reporting the intent regardless is how a failed
  // insert previously came back as "138 assignments" with an empty grid.
  if (assignments.length > 0) {
    const { error } = await supabase.from('schedule_assignments').insert(assignments)
    if (error) {
      return {
        count: 0,
        unfilled: 0,
        error:
          error.code === '42703' || error.code === 'PGRST205'
            ? `The database is missing a column this writes. Run the pending migrations in supabase/migrations, then try again. (${error.message})`
            : error.message,
      }
    }
  }

  revalidatePath('/dashboard/schedule')
  return { count: assignments.length, unfilled }
}

export type SaveResult = { ok: true } | { ok: false; error: string }

function toResult(error: { message: string; code?: string } | null): SaveResult {
  if (!error) return { ok: true }
  if (error.code === '42703' || error.code === 'PGRST205') {
    return {
      ok: false,
      error:
        'The database is missing a table or column this screen writes. Run the pending ' +
        `migrations in supabase/migrations, then try again. (${error.message})`,
    }
  }
  return { ok: false, error: error.message }
}

export async function saveAssignment(assignment: {
  id?: string
  year: number
  date: string
  location: string
  position: string
  slot_order: number
  employee_id: string | null
  planned_start: string | null
  planned_end: string | null
  status: string
}): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = assignment.id
    ? await supabase.from('schedule_assignments').update({
        employee_id: assignment.employee_id,
        planned_start: assignment.planned_start,
        planned_end: assignment.planned_end,
      }).eq('id', assignment.id)
    : await (async () => {
        const { id: _id, ...rest } = assignment
        return supabase.from('schedule_assignments').insert(rest)
      })()

  if (error) return toResult(error)
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/timetracking')
  return { ok: true }
}

export async function removeAssignment(id: string): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('schedule_assignments').delete().eq('id', id)
  if (error) return toResult(error)
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/timetracking')
  return { ok: true }
}

export async function publishPeriod(dates: string[]): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('schedule_assignments')
    .update({ status: 'published' })
    .in('date', dates)
    .eq('status', 'draft')
  if (error) return toResult(error)
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/timetracking')
  return { ok: true }
}

export async function clearDraftPeriod(dates: string[]): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('schedule_assignments')
    .delete()
    .in('date', dates)
    .eq('status', 'draft')
  if (error) return toResult(error)
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/timetracking')
  return { ok: true }
}
