'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveTournamentSettings(formData: FormData) {
  const supabase = await createClient()
  const year = parseInt(formData.get('year') as string)
  const start_date = formData.get('start_date') as string
  const pre_tournament_days = parseInt(formData.get('pre_tournament_days') as string)

  await supabase.from('tournament_settings').upsert(
    { year, start_date, pre_tournament_days },
    { onConflict: 'year' }
  )
  revalidatePath('/dashboard/setup')
  revalidatePath('/dashboard')
}

export async function saveStadiumOpenDays(
  year: number,
  openDays: { period: number; day_index: number; is_open: boolean }[]
) {
  const supabase = await createClient()

  // Delete existing config for this year
  await supabase.from('stadium_open_days').delete().eq('year', year)

  // Insert new config
  if (openDays.length > 0) {
    await supabase.from('stadium_open_days').insert(
      openDays.map(d => ({ year, ...d }))
    )
  }
  revalidatePath('/dashboard/setup')
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
