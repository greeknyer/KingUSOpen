import { createClient } from '@/lib/supabase/server'
import SetupClient from './setup-client'
import { TournamentSettings, OperatingHours, Register4Config, ShiftTemplate, Employee } from '@/lib/types'

export default async function SetupPage() {
  const supabase = await createClient()

  const [
    { data: settingsRows },
    { data: hoursRows },
    { data: reg4Rows },
    { data: templateRows },
    { data: employeeRows },
  ] = await Promise.all([
    supabase.from('tournament_settings').select('*').order('year', { ascending: false }).limit(1),
    supabase.from('operating_hours').select('*').order('period').order('day_index'),
    supabase.from('register4_config').select('*').order('period'),
    supabase.from('shift_templates').select('*').order('location').order('slot_order'),
    supabase.from('employees').select('*').eq('active', true).order('name'),
  ])

  const settings: TournamentSettings | null = settingsRows?.[0] ?? null
  const hours: OperatingHours[] = (hoursRows ?? []).filter(
    r => !settings || r.year === settings.year
  )
  const register4: Register4Config[] = (reg4Rows ?? []).filter(
    r => !settings || r.year === settings.year
  )
  const shiftTemplates: ShiftTemplate[] = (templateRows ?? []).filter(
    r => !settings || r.year === settings.year
  )

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tournament Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Configure the annual US Open schedule</p>
      </div>
      <SetupClient settings={settings} hours={hours} register4={register4} shiftTemplates={shiftTemplates} employees={(employeeRows ?? []) as Employee[]} />
    </div>
  )
}
