import { createClient } from '@/lib/supabase/server'
import TimeTrackingClient from './timetracking-client'
import Link from 'next/link'
import { getTournamentDates, ScheduleAssignment, OperatingHours } from '@/lib/types'

export default async function TimeTrackingPage() {
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Time Tracking</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          No tournament configured.{' '}
          <Link href="/dashboard/setup" className="font-semibold underline">Go to Setup first.</Link>
        </div>
      </div>
    )
  }

  const { allDates } = getTournamentDates(settings)

  // Assignments and hours come along so the screen can offer each person's
  // scheduled shift as the starting point, including resolving a planned end
  // of "Close" into that day's actual closing time.
  const [{ data: entries }, { data: assignments }, { data: hours }] = await Promise.all([
    supabase
      .from('time_entries')
      .select('*, employee:employees(*)')
      .in('date', allDates)
      .eq('year', settings.year)
      .order('date'),
    supabase
      .from('schedule_assignments')
      .select('*')
      .in('date', allDates)
      .eq('year', settings.year)
      .not('employee_id', 'is', null),
    supabase.from('operating_hours').select('*').eq('year', settings.year),
  ])

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Time Tracking</h1>
        <p className="text-sm text-gray-500 mt-1">US Open {settings.year} · Enter daily clock-in and clock-out times</p>
      </div>
      <TimeTrackingClient
        employees={employees ?? []}
        entries={entries ?? []}
        assignments={(assignments ?? []) as ScheduleAssignment[]}
        operatingHours={(hours ?? []) as OperatingHours[]}
        settings={settings}
      />
    </div>
  )
}
