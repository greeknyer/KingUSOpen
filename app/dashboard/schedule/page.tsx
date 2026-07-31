import { createClient } from '@/lib/supabase/server'
import ScheduleClient from './schedule-client'
import Link from 'next/link'
import { getTournamentDates } from '@/lib/types'

export default async function SchedulePage() {
  const supabase = await createClient()

  const [
    { data: employees },
    { data: settingsRows },
    { data: operatingHours },
    { data: reg4Config },
    { data: shiftTemplates },
  ] = await Promise.all([
    supabase.from('employees').select('*').eq('active', true).order('name'),
    supabase.from('tournament_settings').select('*').order('year', { ascending: false }).limit(1),
    supabase.from('operating_hours').select('*'),
    supabase.from('register4_config').select('*'),
    supabase.from('shift_templates').select('*'),
  ])

  const settings = settingsRows?.[0]

  if (!settings) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Schedule</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          No tournament configured.{' '}
          <Link href="/dashboard/setup" className="font-semibold underline">Go to Setup first.</Link>
        </div>
      </div>
    )
  }

  const { allDates } = getTournamentDates(settings)

  const { data: assignments } = await supabase
    .from('schedule_assignments')
    .select('*, employee:employees(*)')
    .in('date', allDates)
    .order('slot_order')

  return (
    <div className="p-8 max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <p className="text-sm text-gray-500 mt-1">US Open {settings.year} · Click any cell to assign or edit</p>
      </div>
      <ScheduleClient
        employees={employees ?? []}
        assignments={assignments ?? []}
        settings={settings}
        operatingHours={operatingHours ?? []}
        register4Configs={reg4Config ?? []}
        shiftTemplates={shiftTemplates ?? []}
      />
    </div>
  )
}
