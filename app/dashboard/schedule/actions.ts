'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  Employee, FOOD_VILLAGE_POSITIONS, STADIUM_POSITIONS, TournamentSettings,
  OperatingHours, Location, buildHoursMap, getHoursForDate, shiftLengthHours,
  ShiftTemplate, shiftsForDay, canWork, Position,
} from '@/lib/types'

export async function autoSchedulePeriod(
  dates: string[],
  year: number,
  register4ActiveDates: string[]
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

  // Build availability map: default = available
  const availMap = new Map<string, boolean>()
  avails?.forEach(a => availMap.set(`${a.employee_id}:${a.date}`, a.available))

  function isAvail(empId: string, date: string): boolean {
    const key = `${empId}:${date}`
    return availMap.has(key) ? availMap.get(key)! : true
  }

  // Track hours assigned per employee (for fair distribution). Named apart from
  // the operating-hours map above, which is a different thing entirely.
  const hoursTally = new Map<string, number>(employees.map((e: Employee) => [e.id, 0]))

  const assignments: object[] = []
  let unfilled = 0

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

    const fvPositions = FOOD_VILLAGE_POSITIONS.filter(p => {
      if (p.id === 'register_4') return register4ActiveDates.includes(date)
      return true
    })

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
    const maxShifts = Math.max(fvShifts.length, stadiumShifts.length)

    // `s` is the ordering rank, not the slot number: shiftsForDay drops a
    // template that falls outside a day's hours, so a day opening at 5pm
    // returns shifts #2 and #3 with nothing at index 0's usual #1. Carry each
    // shift's own slot_order through, or assignments land in the wrong row.
    for (let s = 0; s < maxShifts; s++) {
      const fv = fvShifts[s]
      if (fv) {
        for (const pos of fvPositions) {
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
      const st = stadiumShifts[s]
      if (st) {
        for (const pos of STADIUM_POSITIONS) {
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

    // Pin the Stadium manager first. They float between Register and Prep and
    // work open to close rather than a split shift, so their position's later
    // slots need no one — recorded here and skipped below.
    const managerCovers = new Set<string>()
    if (stadiumManager && stadiumShifts.length > 0 && isAvail(stadiumManager.id, date)) {
      const pos =
        STADIUM_POSITIONS.find(p => canWork(stadiumManager, p.id)) ?? STADIUM_POSITIONS[0]
      const stadiumHours = getHoursForDate(hoursMap, 'stadium', date, settings)
      assignments.push({
        year,
        date,
        location: 'stadium',
        position: pos.id,
        slot_order: 1,
        employee_id: stadiumManager.id,
        planned_start: stadiumHours?.open_time ?? stadiumShifts[0].start,
        planned_end: stadiumHours?.close_time ?? null,
        status: 'draft',
      })
      assignedToday.add(stadiumManager.id)
      managerCovers.add(pos.id)
      hoursTally.set(
        stadiumManager.id,
        (hoursTally.get(stadiumManager.id) ?? 0) +
          shiftLengthHours(stadiumHours?.open_time ?? null, stadiumHours?.close_time ?? null)
      )
    }

    for (const slot of slots) {
      // The Stadium manager works their position open to close, so no other
      // slot of that position needs filling.
      if (slot.location === 'stadium' && managerCovers.has(slot.position)) continue

      // Re-sort each time so the employee with the fewest hours so far goes
      // next. Only people qualified for the position are eligible; Chef
      // prefers a manager among those who can actually cook it.
      const sortByHours = (a: Employee, b: Employee) =>
        (hoursTally.get(a.id) ?? 0) - (hoursTally.get(b.id) ?? 0)

      const eligible = availableEmps
        .filter((e: Employee) => canWork(e, slot.position as Position))
        .sort(sortByHours)
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
        status: 'draft',
      })
      assignedToday.add(emp.id)
      hoursTally.set(
        emp.id,
        (hoursTally.get(emp.id) ?? 0) + shiftLengthHours(slot.start, slot.end)
      )
    }
  }

  if (assignments.length > 0) {
    await supabase.from('schedule_assignments').insert(assignments)
  }

  revalidatePath('/dashboard/schedule')
  return { count: assignments.length, unfilled }
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
}) {
  const supabase = await createClient()
  if (assignment.id) {
    await supabase.from('schedule_assignments').update({
      employee_id: assignment.employee_id,
      planned_start: assignment.planned_start,
      planned_end: assignment.planned_end,
    }).eq('id', assignment.id)
  } else {
    const { id: _, ...rest } = assignment
    await supabase.from('schedule_assignments').insert(rest)
  }
  revalidatePath('/dashboard/schedule')
}

export async function removeAssignment(id: string) {
  const supabase = await createClient()
  await supabase.from('schedule_assignments').delete().eq('id', id)
  revalidatePath('/dashboard/schedule')
}

export async function publishPeriod(dates: string[]) {
  const supabase = await createClient()
  await supabase
    .from('schedule_assignments')
    .update({ status: 'published' })
    .in('date', dates)
    .eq('status', 'draft')
  revalidatePath('/dashboard/schedule')
}

export async function clearDraftPeriod(dates: string[]) {
  const supabase = await createClient()
  await supabase
    .from('schedule_assignments')
    .delete()
    .in('date', dates)
    .eq('status', 'draft')
  revalidatePath('/dashboard/schedule')
}
