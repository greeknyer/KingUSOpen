'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function calcHours(timeIn: string | null, timeOut: string | null): number | null {
  if (!timeIn || !timeOut) return null
  const [inH, inM] = timeIn.split(':').map(Number)
  const [outH, outM] = timeOut.split(':').map(Number)
  const diff = (outH * 60 + outM) - (inH * 60 + inM)
  if (diff <= 0) return null
  return Math.round(diff / 60 * 100) / 100
}

export async function saveTimeEntry(
  year: number,
  employeeId: string,
  date: string,
  actualIn: string | null,
  actualOut: string | null,
  notes: string | null,
  existingId?: string
) {
  const supabase = await createClient()
  const hours = calcHours(actualIn, actualOut)

  const data = {
    year,
    employee_id: employeeId,
    date,
    actual_in: actualIn || null,
    actual_out: actualOut || null,
    hours_calculated: hours,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }

  if (existingId) {
    await supabase.from('time_entries').update(data).eq('id', existingId)
  } else {
    await supabase.from('time_entries').upsert(
      data,
      { onConflict: 'employee_id,date' }
    )
  }

  revalidatePath('/dashboard/timetracking')
  return hours
}

export async function deleteTimeEntry(id: string) {
  const supabase = await createClient()
  await supabase.from('time_entries').delete().eq('id', id)
  revalidatePath('/dashboard/timetracking')
}
