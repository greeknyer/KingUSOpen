'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveTournamentSettings(formData: FormData) {
  const supabase = await createClient()
  const year = parseInt(formData.get('year') as string)
  const start_date = formData.get('start_date') as string
  const pre_tournament_days = parseInt(formData.get('pre_tournament_days') as string)

  // Blank select values arrive as '' — store NULL so the FK stays valid.
  const general_manager_id = (formData.get('general_manager_id') as string) || null
  const stadium_manager_id = (formData.get('stadium_manager_id') as string) || null

  await supabase.from('tournament_settings').upsert(
    { year, start_date, pre_tournament_days, general_manager_id, stadium_manager_id },
    { onConflict: 'year' }
  )
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard')
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
) {
  const supabase = await createClient()

  // Replace the whole year's grid in one go — the Setup screen always submits
  // every day it rendered, so a delete-then-insert keeps the table in step with
  // the form even when pre_tournament_days shrinks.
  await supabase.from('operating_hours').delete().eq('year', year)

  if (rows.length > 0) {
    await supabase.from('operating_hours').insert(
      rows.map(r => ({
        year,
        ...r,
        // A blank time from a form arrives as '' — store it as NULL so
        // close_time NULL keeps meaning "open-ended".
        open_time: r.open_time || null,
        close_time: r.close_time || null,
      }))
    )
  }
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/schedule')
}

export async function saveRegister4Config(
  year: number,
  configs: { period: number; is_active: boolean }[]
) {
  const supabase = await createClient()

  await supabase.from('register4_config').delete().eq('year', year)

  if (configs.length > 0) {
    await supabase.from('register4_config').insert(
      configs.map(c => ({ year, ...c }))
    )
  }
  revalidatePath('/dashboard/setup')
}

export async function saveShiftTemplates(
  year: number,
  templates: { location: string; slot_order: number; start_time: string; end_time: string | null }[]
) {
  const supabase = await createClient()

  await supabase.from('shift_templates').delete().eq('year', year)

  if (templates.length > 0) {
    await supabase.from('shift_templates').insert(
      templates.map(t => ({
        year,
        ...t,
        // A blank end means the shift runs to that day's close.
        end_time: t.end_time || null,
      }))
    )
  }
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard/schedule')
}
