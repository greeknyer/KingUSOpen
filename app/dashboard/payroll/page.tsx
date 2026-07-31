import { createClient } from '@/lib/supabase/server'
import PayrollClient from './payroll-client'
import Link from 'next/link'
import { getTournamentDates } from '@/lib/types'

export default async function PayrollPage() {
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payroll Export</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          No tournament configured.{' '}
          <Link href="/dashboard/setup" className="font-semibold underline">Go to Setup first.</Link>
        </div>
      </div>
    )
  }

  const { allDates } = getTournamentDates(settings)

  const { data: entries } = await supabase
    .from('time_entries')
    .select('*, employee:employees(*)')
    .in('date', allDates)
    .eq('year', settings.year)
    .order('date')

  return (
    <div className="p-8 max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payroll Export</h1>
        <p className="text-sm text-gray-500 mt-1">US Open {settings.year} · Hours summary per employee</p>
      </div>
      <PayrollClient
        employees={employees ?? []}
        entries={entries ?? []}
        settings={settings}
      />
    </div>
  )
}
