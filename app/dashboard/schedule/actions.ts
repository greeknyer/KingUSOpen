'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Employee, FOOD_VILLAGE_POSITIONS, STADIUM_POSITIONS } from '@/lib/types'

export async function autoSchedulePeriod(
  dates: string[],
  year: number,
  stadiumOpenDates: string[],
  register4ActiveDates: string[]
) {
  const supabase = await createClient()

  // Clear existing drafts for these dates
  await supabase
    .from('schedule_assignments')
    .delete()
    .in('date', dates)
    .eq('status', 'draft')

  // Load employees and availability
  const [{ data: employees }, { data: avails }] = await Promise.all([
    supabase.from('employees').select('*').eq('active', true),
    supabase.from('availability').select('*').in('date', dates),
  ])

  if (!employees || employees.length === 0) return { count: 0 }

  // Build availability map: default = available
  const availMap = new Map<string, boolean>()
  avails?.forEach(a => availMap.set(`${a.employee_id}:${a.date}`, a.available))

  function isAvail(empId: string, date: string): boolean {
    const key = `${empId}:${date}`
    return availMap.has(key) ? availMap.get(key)! : true
  }

  // Track hours assigned per employee (for fair distribution)
  const hoursMap = new Map<string, number>(employees.map((e: Employee) => [e.id, 0]))

  const assignments: object[] = []

  for (const date of dates) {
    const availableEmps = employees.filter((e: Employee) => isAvail(e.id, date))
    const managers = availableEmps.filter((e: Employee) => e.role === 'manager')
    const crew = availableEmps.filter((e: Employee) => e.role === 'crew')

    // Sort by hours assigned (fewest first) for fair distribution
    const sortByHours = (a: Employee, b: Employee) =>
      (hoursMap.get(a.id) ?? 0) - (hoursMap.get(b.id) ?? 0)

    managers.sort(sortByHours)
    crew.sort(sortByHours)

    const assignedToday = new Set<string>()

    // Assign to Food Village positions
    const positions = FOOD_VILLAGE_POSITIONS.filter(p => {
      if (p.id === 'register_4') return register4ActiveDates.includes(date)
      return true
    })

    for (const pos of positions) {
      // Assign slot 1 (early shift)
      const pool = pos.id === 'chef' ? [...managers, ...crew] : [...crew, ...managers]
      const emp1 = pool.find(e => !assignedToday.has(e.id))
      if (emp1) {
        assignments.push({
          year,
          date,
          location: 'food_village',
          position: pos.id,
          slot_order: 1,
          employee_id: emp1.id,
          planned_start: '10:00',
          planned_end: '16:00',
          status: 'draft',
        })
        assignedToday.add(emp1.id)
        hoursMap.set(emp1.id, (hoursMap.get(emp1.id) ?? 0) + 6)
      }
    }

    // Assign to Stadium if open that day
    if (stadiumOpenDates.includes(date)) {
      const stadiumEmps = employees
        .filter((e: Employee) => isAvail(e.id, date) && !assignedToday.has(e.id))
        .sort(sortByHours)

      for (const pos of STADIUM_POSITIONS) {
        const emp = stadiumEmps.shift()
        if (emp) {
          assignments.push({
            year,
            date,
            location: 'stadium',
            position: pos.id,
            slot_order: 1,
            employee_id: emp.id,
            planned_start: '10:30',
            planned_end: '16:00',
            status: 'draft',
          })
          assignedToday.add(emp.id)
          hoursMap.set(emp.id, (hoursMap.get(emp.id) ?? 0) + 5.5)
        }
      }
    }
  }

  if (assignments.length > 0) {
    await supabase.from('schedule_assignments').insert(assignments)
  }

  revalidatePath('/dashboard/schedule')
  return { count: assignments.length }
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
