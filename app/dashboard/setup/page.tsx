import { createClient } from '@/lib/supabase/server'
import SetupClient from './setup-client'
import { TournamentSettings, StadiumOpenDay, Register4Config } from '@/lib/types'

export default async function SetupPage() {
  const supabase = await createClient()

  const [
    { data: settingsRows },
    { data: stadiumRows },
    { data: reg4Rows },
  ] = await Promise.all([
    supabase.from('tournament_settings').select('*').order('year', { ascending: false }).limit(1),
    supabase.from('stadium_open_days').select('*').order('period').order('day_index'),
    supabase.from('register4_config').select('*').order('period'),
  ])

  const settings: TournamentSettings | null = settingsRows?.[0] ?? null
  const stadiumDays: StadiumOpenDay[] = (stadiumRows ?? []).filter(
    r => !settings || r.year === settings.year
  )
  const register4: Register4Config[] = (reg4Rows ?? []).filter(
    r => !settings || r.year === settings.year
  )

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tournament Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Configure the annual US Open schedule</p>
      </div>
      <SetupClient settings={settings} stadiumDays={stadiumDays} register4={register4} />
    </div>
  )
}
