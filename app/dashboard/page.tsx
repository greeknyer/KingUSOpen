import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: employeeCount },
    { data: settings },
  ] = await Promise.all([
    supabase.from('employees').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('tournament_settings').select('*').order('year', { ascending: false }).limit(1),
  ])

  const currentSettings = settings?.[0]
  const year = currentSettings?.year ?? new Date().getFullYear()

  const quickLinks = [
    { href: '/dashboard/setup', label: 'Tournament Setup', desc: 'Configure dates and stadium schedule', icon: '⚙️' },
    { href: '/dashboard/employees', label: 'Employees', desc: 'Manage staff and roles', icon: '👥' },
    { href: '/dashboard/availability', label: 'Availability', desc: 'Set who is available each day', icon: '📅' },
    { href: '/dashboard/schedule', label: 'Schedule', desc: 'Assign staff to positions', icon: '📋' },
    { href: '/dashboard/timetracking', label: 'Time Tracking', desc: 'Log daily in/out times', icon: '⏱️' },
    { href: '/dashboard/payroll', label: 'Payroll Export', desc: 'Download hours report', icon: '💰' },
  ]

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {currentSettings
            ? `US Open ${year} · Starts ${new Date(currentSettings.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
            : 'No tournament configured yet — go to Tournament Setup first'
          }
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500 mb-1">Active Employees</p>
          <p className="text-3xl font-bold text-gray-900">{employeeCount ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500 mb-1">Tournament Year</p>
          <p className="text-3xl font-bold text-gray-900">{year}</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-4">
          {quickLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm hover:border-gray-300 transition group"
            >
              <div className="text-2xl mb-2">{link.icon}</div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">{link.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{link.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
