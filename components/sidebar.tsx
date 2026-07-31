'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/dashboard/setup', label: 'Tournament Setup', icon: '⚙️' },
  { href: '/dashboard/employees', label: 'Employees', icon: '👥' },
  { href: '/dashboard/availability', label: 'Availability', icon: '📅' },
  { href: '/dashboard/schedule', label: 'Schedule', icon: '📋' },
  { href: '/dashboard/timetracking', label: 'Time Tracking', icon: '⏱️' },
  { href: '/dashboard/payroll', label: 'Payroll Export', icon: '💰' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="w-56 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-5 border-b border-gray-100">
        <div className="text-lg">🎾</div>
        <div className="text-sm font-bold text-gray-900 mt-1">King US Open</div>
        <div className="text-xs text-gray-400">Scheduler</div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(item => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                isActive
                  ? 'bg-gray-900 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <button
          onClick={handleSignOut}
          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition"
        >
          <span>🚪</span>
          Sign out
        </button>
      </div>
    </div>
  )
}
