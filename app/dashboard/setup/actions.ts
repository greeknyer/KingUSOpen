'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type SaveResult = { ok: true } | { ok: false; error: string }

/**
 * Turn a Supabase error into something the screen can show. A write Postgres
 * rejects otherwise looks identical to one that succeeded, which made a missing
 * migration present itself as "the save button does nothing".
 */
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
 * Replace every row for a year in one go.
 *
 * These screens always submit the complete set, so the table is rebuilt rather
 * than diffed. The delete and insert are separate statements, though, and there
 * is no transaction across them — so a rejected insert used to leave the table
 * EMPTY, which is worse than not saving at all. An empty shift_templates makes
 * every position fall back to a split of the day's hours, silently dropping the
 * mid shift from the registers.
 *
 * So the current rows are read first and put back if the insert fails.
 */
async function replaceYear(
  table: string,
  year: number,
  rows: Record<string, unknown>[]
): Promise<SaveResult> {
  const supabase = await createClient()

  const { data: previous, error: readError } = await supabase
    .from(table).select('*').eq('year', year)
  if (readError) return toResult(readError)

  const { error: delError } = await supabase.from(table).delete().eq('year', year)
  if (delError) return toResult(delError)

  if (rows.length === 0) return { ok: true }

  const { error } = await supabase.from(table).insert(rows)
  if (!error) return { ok: true }

  // Put back what was there, so a failed save changes nothing.
  if (previous && previous.length > 0) {
    await supabase.from(table).insert(previous)
  }
  return toResult(error)
}

export async function saveTournamentSettings(formData: FormData): Promise<SaveResult> {
  const supabase = await createClient()
  const year = parseInt(formData.get('year') as string)
  const start_date = formData.get('start_date') as string
  const pre_tournament_days = parseInt(formData.get('pre_tournament_days') as string)

  // Blank select values arrive as '' — store NULL so the FK stays valid.
  const general_manager_id = (formData.get('general_manager_id') as string) || null
  const stadium_manager_id = (formData.get('stadium_manager_id') as string) || null

  const { error } = await supabase.from('tournament_settings').upsert(
    { year, start_date, pre_tournament_days, general_manager_id, stadium_manager_id },
    { onConflict: 'year' }
  )
  if (error) return toResult(error)
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

export async function saveOperatingHours(
  year: number,
  rows: {
    location: string
    period: number
    day_index: number
    is_open: boolean
    open_time: string | null
    close_time: string | null
  }[]
): Promise<SaveResult> {
  const result = await replaceYear('operating_hours', year,
    rows.map(r => ({
      year,
      ...r,
      // A blank time from a form arrives as '' — store it as NULL so
      // close_time NULL keeps meaning "open-ended".
      open_time: r.open_time || null,
      close_time: r.close_time || null,
    }))
  )
  if (!result.ok) return result
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

export async function saveOptionalPositions(
  year: number,
  configs: { period: number; position: string; is_active: boolean; shifts: string[] | null }[]
): Promise<SaveResult> {
  const result = await replaceYear('register4_config', year,
    configs.map(c => ({ year, ...c }))
  )
  if (!result.ok) return result
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

export async function saveShiftTemplates(
  year: number,
  templates: { location: string; section: string | null; position: string | null; slot_order: number; start_time: string; end_time: string | null }[]
): Promise<SaveResult> {
  const result = await replaceYear('shift_templates', year,
    templates.map(t => ({
      year,
      ...t,
      // A blank end means the shift runs to that day's close.
      end_time: t.end_time || null,
    }))
  )
  if (!result.ok) return result
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}
