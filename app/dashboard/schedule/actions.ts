'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  Employee, FOOD_VILLAGE_POSITIONS, STADIUM_POSITIONS, TournamentSettings,
  OperatingHours, Location, buildHoursMap, getHoursForDate,
  ShiftTemplate, shiftsForDay, canWorkOn, canWorkLocation, Position,
  sectionForPosition, OptionalPositionConfig, buildPeriodShiftMap,
  positionRunsSlotInPeriod, positionOpenInPeriod, getPeriodAndDayIndex,
  Availability, availableShiftsOn, worksFullDayOn, shiftPeriodFor, positionRunsSlot,
} from '@/lib/types'
import { SHIFT_PRIORITY, fillDay, DaySlot } from '@/lib/scheduling'

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
    { data: hoursRows }, { data: templateRows }, { data: periodRows },
  ] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true),
      supabase.from('availability').select('*').in('date', dates),
      supabase.from('tournament_settings').select('*').eq('year', year).limit(1),
      supabase.from('operating_hours').select('*').eq('year', year),
      supabase.from('shift_templates').select('*').eq('year', year),
      supabase.from('register4_config').select('*').eq('year', year),
    ])

  if (!employees || employees.length === 0) return { count: 0, unfilled: 0 }

  const settings: TournamentSettings | undefined = settingsRows?.[0]
  if (!settings) return { count: 0, unfilled: 0 }

  // Non-null past the guard above; named so the closures below don't re-narrow.
  const staff: Employee[] = employees

  const hoursMap = buildHoursMap((hoursRows ?? []) as OperatingHours[])

  const templates = (templateRows ?? []) as ShiftTemplate[]

  // Which shifts each position runs, per period — a till can be the midday one
  // in one week and a normal AM/PM till in another.
  const periodShiftMap = buildPeriodShiftMap((periodRows ?? []) as OptionalPositionConfig[])

  function periodOf(date: string): number {
    return getPeriodAndDayIndex(date, settings!)?.period ?? 1
  }

  /**
   * The shifts to staff for a location on a date. Food Village resolves its
   * three templates against the day's hours; the Stadium splits its hours,
   * giving one shift on a short or open-ended day and two on a long one.
   */
  function shiftsFor(
    location: Location,
    date: string,
    section: string | null = null,
    position: Position | null = null
  ) {
    const h = getHoursForDate(hoursMap, location, date, settings!)
    if (!h) return []
    return shiftsForDay(location, h, templates, section, position)
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

    const period = periodOf(date)
    // A position runs today if it runs any shift this period, and — for the
    // ones still on the on/off switch — if it's switched on for the date.
    const fvPositions = FOOD_VILLAGE_POSITIONS.filter(p => {
      if (!positionOpenInPeriod(periodShiftMap, p.id, period)) return false
      return p.configurable ? (activeDates[p.id] ?? []).includes(date) : true
    })

    const fvShifts = shiftsFor('food_village', date)
    const stadiumShifts = shiftsFor('stadium', date)

    // Build the day's slots ordered by shift first, then location, then
    // position. Ordering by shift matters when staff is tight: it covers every
    // position's opening shift before staffing anyone's handoff, rather than
    // fully staffing a few positions and leaving others dark all day.
    const slots: DaySlot[] = []

    // Built in operational priority — see SHIFT_PRIORITY. Slots are filled in
    // this same order, so a short day loses mids rather than leaving a position
    // with nobody to open it.
    // `shiftPeriod` is AM/MID/PM; `period` above is the tournament week.
    for (const shiftPeriod of SHIFT_PRIORITY) {
      for (const pos of fvPositions) {
        // Each position takes its section's times — the kitchen opens earlier
        // than the registers, so its AM is a different shift entirely.
        const posShifts = shiftsFor('food_village', date, sectionForPosition(pos.id), pos.id)
        const fv = posShifts.find(s => shiftPeriodFor('food_village', s.slot_order) === shiftPeriod)
        if (!fv) continue
        // Not every position runs every shift — the kitchen has no mid.
        if (!positionRunsSlotInPeriod(periodShiftMap, 'food_village', pos.id, fv.slot_order, period)) continue
        slots.push({
          location: 'food_village',
          position: pos.id,
          isChef: pos.id === 'chef',
          slotOrder: fv.slot_order,
          start: fv.start,
          end: fv.end,
        })
      }
      const st = stadiumShifts.find(s => shiftPeriodFor('stadium', s.slot_order) === shiftPeriod)
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

    // Everything above worked out WHAT the day needs. Who fills it is decided
    // by fillDay, which is pure and lives in lib/scheduling.ts so the fairness
    // rules can be measured directly instead of only through this action.
    const fullDayCandidates = [
      ...(fvShifts.length > 0
        ? fvPositions.map(p => ({ location: 'food_village' as Location, position: p.id }))
        : []),
      ...(stadiumShifts.length > 0
        ? STADIUM_POSITIONS.map(p => ({ location: 'stadium' as Location, position: p.id }))
        : []),
    ]

    const { placements, unfilled: dayUnfilled } = fillDay({
      staff: availableEmps,
      slots,
      fullDayCandidates,
      locationShifts: (loc: Location) => (loc === 'food_village' ? fvShifts : stadiumShifts),
      fullDayWindow: (loc: Location) => {
        const h = getHoursForDate(hoursMap, loc, date, settings!)
        const first = loc === 'food_village' ? fvShifts[0] : stadiumShifts[0]
        return { start: h?.open_time ?? first?.start ?? '00:00', end: h?.close_time ?? null }
      },
      availableShifts: (e: Employee) => shiftsAvailable(e, date),
      worksFullDay: (e: Employee) => isFullDay(e, date),
      canPosition: (e: Employee, position: Position) =>
        canWorkOn(e, position, availMap.get(`${e.id}:${date}`)),
      canLocation: canWorkLocation,
      underCap,
      hoursSoFar: (e: Employee) => hoursTally.get(e.id) ?? 0,
      stadiumManager:
        stadiumManager && isAvail(stadiumManager.id, date) ? stadiumManager : undefined,
    })

    unfilled += dayUnfilled

    for (const p of placements) {
      assignments.push({
        year,
        date,
        location: p.location,
        position: p.position,
        slot_order: p.slotOrder,
        employee_id: p.employee.id,
        planned_start: p.start,
        planned_end: p.end,
        // Written explicitly even though it has a default: PostgREST rejects a
        // bulk insert whose objects do not all carry the same keys.
        is_full_day: p.isFullDay,
        status: 'draft',
      })
      recordShift(p.employee.id)
      hoursTally.set(p.employee.id, (hoursTally.get(p.employee.id) ?? 0) + p.hours)
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

/**
 * Put a published period back to draft.
 *
 * The counterpart to publishPeriod, for a Publish pressed by mistake. Nothing
 * is deleted — the rows return to draft exactly as they were, so publishing
 * again restores the same schedule.
 */
export async function unpublishPeriod(dates: string[]): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('schedule_assignments')
    .update({ status: 'draft' })
    .in('date', dates)
    .eq('status', 'published')
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
