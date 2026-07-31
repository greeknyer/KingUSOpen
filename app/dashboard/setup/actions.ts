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
  const supabase = await createClient()

  // Replace the whole year's grid in one go — the Setup screen always submits
  // every day it rendered, so a delete-then-insert keeps the table in step with
  // the form even when pre_tournament_days shrinks.
  const { error: delError } = await supabase.from('operating_hours').delete().eq('year', year)
  if (delError) return toResult(delError)

  if (rows.length > 0) {
    const { error } = await supabase.from('operating_hours').insert(
      rows.map(r => ({
        year,
        ...r,
        // A blank time from a form arrives as '' — store it as NULL so
        // close_time NULL keeps meaning "open-ended".
        open_time: r.open_time || null,
        close_time: r.close_time || null,
      }))
    )
    if (error) return toResult(error)
  }
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

export async function saveOptionalPositions(
  year: number,
  configs: { period: number; position: string; is_active: boolean }[]
): Promise<SaveResult> {
  const supabase = await createClient()

  const { error: delError } = await supabase.from('register4_config').delete().eq('year', year)
  if (delError) return toResult(delError)

  if (configs.length > 0) {
    const { error } = await supabase.from('register4_config').insert(
      configs.map(c => ({ year, ...c }))
    )
    if (error) return toResult(error)
  }
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

export async function saveShiftTemplates(
  year: number,
  templates: { location: string; section: string | null; slot_order: number; start_time: string; end_time: string | null }[]
): Promise<SaveResult> {
  const supabase = await createClient()

  const { error: delError } = await supabase.from('shift_templates').delete().eq('year', year)
  if (delError) return toResult(delError)

  if (templates.length > 0) {
    const { error } = await supabase.from('shift_templates').insert(
      templates.map(t => ({
        year,
        ...t,
        // A blank end means the shift runs to that day's close.
        end_time: t.end_time || null,
      }))
    )
    if (error) return toResult(error)
  }
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}
