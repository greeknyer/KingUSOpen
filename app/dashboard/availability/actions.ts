'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleAvailability(
  employeeId: string,
  date: string,
  currentlyAvailable: boolean
) {
  const supabase = await createClient()
  await supabase.from('availability').upsert(
    { employee_id: employeeId, date, available: !currentlyAvailable },
    { onConflict: 'employee_id,date' }
  )
  revalidatePath('/dashboard/availability')
}

export async function setAllAvailable(employeeIds: string[], dates: string[]) {
  const supabase = await createClient()
  const rows = employeeIds.flatMap(employee_id =>
    dates.map(date => ({ employee_id, date, available: true }))
  )
  await supabase.from('availability').upsert(rows, { onConflict: 'employee_id,date' })
  revalidatePath('/dashboard/availability')
}

export async function setAllUnavailable(employeeIds: string[], dates: string[]) {
  const supabase = await createClient()
  const rows = employeeIds.flatMap(employee_id =>
    dates.map(date => ({ employee_id, date, available: false }))
  )
  await supabase.from('availability').upsert(rows, { onConflict: 'employee_id,date' })
  revalidatePath('/dashboard/availability')
}
