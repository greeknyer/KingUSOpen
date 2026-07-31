import { createClient } from '@/lib/supabase/server'
import AvailabilityGrid from './availability-grid'
import Link from 'next/link'

export default async function AvailabilityPage() {
  const supabase = await createClient()

  const [
    { data: employees },
    { data: settingsRows },
  ] = await Promise.all([
    supabase.from('employees').select('*').eq('active', true).order('name'),
    supabase.from('tournament_settings').select('*').order('year', { ascending: false }).limit(1),
  ])

  const settings = settingsRows?.[0]

  if (!settings) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Availability</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          No tournament configured yet.{' '}
          <Link href="/dashboard/setup" className="font-semibold underline">Go to Tournament Setup</Link> first.
        </div>
      </div>
    )
  }

  const { preTournament, week1, week2, week3 } = (await import('@/lib/types')).getTournamentDates(settings)
  const allDates = [...preTournament, ...week1, ...week2, ...week3]

  const { data: availabilities } = await supabase
    .from('availability')
    .select('*')
    .in('date', allDates)

  return (
    <div className="p-8 max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Availability</h1>
        <p className="text-sm text-gray-500 mt-1">US Open {settings.year} · Mark who is available each day</p>
      </div>
      <AvailabilityGrid
        employees={employees ?? []}
        availabilities={availabilities ?? []}
        settings={settings}
      />
    </div>
  )
}
