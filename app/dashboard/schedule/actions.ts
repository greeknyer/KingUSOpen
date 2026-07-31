'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  Employee, FOOD_VILLAGE_POSITIONS, STADIUM_POSITIONS, TournamentSettings,
  OperatingHours, Location, buildHoursMap, getHoursForDate, planShifts, shiftLengthHours,
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
  const [{ data: employees }, { data: avails }, { data: settingsRows }, { data: hoursRows }] =
    await Promise.all([
      supabase.from('employees').select('*').eq('active', true),
      supabase.from('availability').select('*').in('date', dates),
      supabase.from('tournament_settings').select('*').eq('year', year).limit(1),
      supabase.from('operating_hours').select('*').eq('year', year),
    ])

  if (!employees || employees.length === 0) return { count: 0, unfilled: 0 }

  const settings: TournamentSettings | undefined = settingsRows?.[0]
  if (!settings) return { count: 0, unfilled: 0 }

  const hoursMap = buildHoursMap((hoursRows ?? []) as OperatingHours[])

  /** The shifts to staff for a location on a date, from its configured hours. */
  function shiftsFor(location: Location, date: string) {
    const h = getHoursForDate(hoursMap, location, date, settings!)
    // No row saved: Food Village falls back to a default day, Stadium stays dark.
    if (!h) return location === 'food_village' ? planShifts('10:00', '16:00') : []
    if (!h.is_open) return []
    return planShifts(h.open_time, h.close_time)
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

  for (const date of dates) {
    const availableEmps = employees.filter((e: Employee) => isAvail(e.id, date))
    const managers = availableEmps.filter((e: Employee) => e.role === 'manager')
    const crew = availableEmps.filter((e: Employee) => e.role === 'crew')

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

    for (let s = 0; s < maxShifts; s++) {
      if (fvShifts[s]) {
        for (const pos of fvPositions) {
          slots.push({
            location: 'food_village',
            position: pos.id,
            isChef: pos.id === 'chef',
            slotOrder: s + 1,
            start: fvShifts[s].start,
            end: fvShifts[s].end,
          })
        }
      }
      if (stadiumShifts[s]) {
        for (const pos of STADIUM_POSITIONS) {
          slots.push({
            location: 'stadium',
            position: pos.id,
            isChef: false,
            slotOrder: s + 1,
            start: stadiumShifts[s].start,
            end: stadiumShifts[s].end,
          })
        }
      }
    }

    // One shift per employee per day — a handoff needs a second person.
    const assignedToday = new Set<string>()

    for (const slot of slots) {
      // Re-sort each time so the employee with the fewest hours so far goes
      // next. Chef prefers a manager; everything else prefers crew.
      const sortByHours = (a: Employee, b: Employee) =>
        (hoursTally.get(a.id) ?? 0) - (hoursTally.get(b.id) ?? 0)
      const pool = slot.isChef
        ? [...managers.sort(sortByHours), ...crew.sort(sortByHours)]
        : [...crew.sort(sortByHours), ...managers.sort(sortByHours)]

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
