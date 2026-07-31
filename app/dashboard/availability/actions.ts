'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

/**
 * Records an explicit availability row for one date. The grid derives its
 * default from the employee's weekly pattern, so a row only needs to exist
 * where a specific date departs from it.
 */
export async function toggleAvailability(
  employeeId: string,
  date: string,
  currentlyAvailable: boolean
): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('availability').upsert(
    { employee_id: employeeId, date, available: !currentlyAvailable },
    { onConflict: 'employee_id,date' }
  )
  if (error) return toResult(error)
  revalidatePath('/dashboard/availability')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

/**
 * Deletes the explicit rows for these dates so they fall back to each
 * employee's weekly pattern again.
 */
export async function clearAvailabilityOverrides(
  employeeIds: string[],
  dates: string[]
): Promise<SaveResult> {
  const supabase = await createClient()
  if (employeeIds.length === 0 || dates.length === 0) return { ok: true }
  const { error } = await supabase
    .from('availability')
    .delete()
    .in('employee_id', employeeIds)
    .in('date', dates)
  if (error) return toResult(error)
  revalidatePath('/dashboard/availability')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

export async function setAllAvailable(
  employeeIds: string[],
  dates: string[]
): Promise<SaveResult> {
  const supabase = await createClient()
  const rows = employeeIds.flatMap(employee_id =>
    dates.map(date => ({ employee_id, date, available: true }))
  )
  const { error } = await supabase
    .from('availability')
    .upsert(rows, { onConflict: 'employee_id,date' })
  if (error) return toResult(error)
  revalidatePath('/dashboard/availability')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

export async function setAllUnavailable(
  employeeIds: string[],
  dates: string[]
): Promise<SaveResult> {
  const supabase = await createClient()
  const rows = employeeIds.flatMap(employee_id =>
    dates.map(date => ({ employee_id, date, available: false }))
  )
  const { error } = await supabase
    .from('availability')
    .upsert(rows, { onConflict: 'employee_id,date' })
  if (error) return toResult(error)
  revalidatePath('/dashboard/availability')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}
