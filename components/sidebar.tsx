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
  { href: '/dashboard/products', label: 'Product Sheet', icon: '📦' },
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
    // Narrow icon rail by default so the schedule grid gets the width back on
    // an iPad; full labelled sidebar from xl up (desktop, iPad Pro landscape).
    <div className="no-print w-20 xl:w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-3 xl:p-5 border-b border-gray-100 text-center xl:text-left">
        <div className="text-lg">🎾</div>
        <div className="hidden xl:block text-sm font-bold text-gray-900 mt-1">King US Open</div>
        <div className="hidden xl:block text-xs text-gray-400">Scheduler</div>
      </div>

      <nav className="flex-1 p-2 xl:p-3 space-y-1">
        {navItems.map(item => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              // Stacked icon-over-label on the rail keeps every destination
              // readable without hover tooltips, which touch has no way to show.
              className={`flex flex-col xl:flex-row items-center xl:gap-2.5 gap-0.5 px-2 xl:px-3 py-2.5 rounded-lg transition min-h-[56px] xl:min-h-0 justify-center xl:justify-start text-center xl:text-left ${
                isActive
                  ? 'bg-gray-900 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
              }`}
            >
              <span className="text-xl xl:text-base leading-none">{item.icon}</span>
              <span className="text-[11px] xl:text-sm leading-tight">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-2 xl:p-3 border-t border-gray-100">
        <button
          onClick={handleSignOut}
          className="w-full flex flex-col xl:flex-row items-center xl:gap-2.5 gap-0.5 px-2 xl:px-3 py-2.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200 transition min-h-[52px] xl:min-h-0 justify-center xl:justify-start"
        >
          <span className="text-xl xl:text-base leading-none">🚪</span>
          <span className="text-[11px] xl:text-sm leading-tight">Sign out</span>
        </button>
      </div>
    </div>
  )
}
