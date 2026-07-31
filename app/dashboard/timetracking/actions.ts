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
 * Hours worked, tolerating a shift that runs past midnight — a Food Village
 * closing shift can clock out after 00:00, which a plain subtraction would read
 * as negative and discard.
 */
function calcHours(timeIn: string | null, timeOut: string | null): number | null {
  if (!timeIn || !timeOut) return null
  const [inH, inM] = timeIn.split(':').map(Number)
  const [outH, outM] = timeOut.split(':').map(Number)
  let diff = outH * 60 + outM - (inH * 60 + inM)
  if (diff < 0) diff += 1440
  if (diff <= 0) return null
  return Math.round((diff / 60) * 100) / 100
}

export async function saveTimeEntry(
  year: number,
  employeeId: string,
  date: string,
  actualIn: string | null,
  actualOut: string | null,
  notes: string | null,
  existingId?: string
): Promise<SaveResult> {
  const supabase = await createClient()

  const data = {
    year,
    employee_id: employeeId,
    date,
    actual_in: actualIn || null,
    actual_out: actualOut || null,
    hours_calculated: calcHours(actualIn, actualOut),
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = existingId
    ? await supabase.from('time_entries').update(data).eq('id', existingId)
    : await supabase.from('time_entries').upsert(data, { onConflict: 'employee_id,date' })

  if (error) return toResult(error)
  revalidatePath('/dashboard/timetracking')
  revalidatePath('/dashboard/payroll')
  return { ok: true }
}

/**
 * Creates entries for everyone scheduled that day from their planned times.
 * Skips anyone who already has an entry, so a manager's correction is never
 * overwritten by a later bulk fill.
 */
export async function fillDayFromSchedule(
  year: number,
  date: string,
  rows: { employee_id: string; actual_in: string; actual_out: string | null }[]
): Promise<SaveResult> {
  if (rows.length === 0) return { ok: true }
  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('time_entries')
    .select('employee_id')
    .eq('date', date)
    .eq('year', year)
  if (readError) return toResult(readError)

  const already = new Set((existing ?? []).map(e => e.employee_id))
  const toInsert = rows
    .filter(r => !already.has(r.employee_id))
    .map(r => ({
      year,
      employee_id: r.employee_id,
      date,
      actual_in: r.actual_in || null,
      actual_out: r.actual_out || null,
      hours_calculated: calcHours(r.actual_in, r.actual_out),
      updated_at: new Date().toISOString(),
    }))

  if (toInsert.length === 0) return { ok: true }

  const { error } = await supabase
    .from('time_entries')
    .upsert(toInsert, { onConflict: 'employee_id,date' })
  if (error) return toResult(error)

  revalidatePath('/dashboard/timetracking')
  revalidatePath('/dashboard/payroll')
  return { ok: true }
}

export async function deleteTimeEntry(id: string): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('time_entries').delete().eq('id', id)
  if (error) return toResult(error)
  revalidatePath('/dashboard/timetracking')
  revalidatePath('/dashboard/payroll')
  return { ok: true }
}
