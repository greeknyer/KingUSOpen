'use client'

import { useState, useTransition } from 'react'
import { TournamentSettings, StadiumOpenDay, Register4Config, getTournamentDates } from '@/lib/types'
import { saveTournamentSettings, saveStadiumOpenDays, saveRegister4Config } from './actions'

const PERIODS = [
  { id: 0, label: 'Pre-tournament' },
  { id: 1, label: 'Week 1' },
  { id: 2, label: 'Week 2' },
  { id: 3, label: 'Week 3' },
]

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function buildDefaultStadiumDays(preDays: number): { period: number; day_index: number; is_open: boolean }[] {
  const days: { period: number; day_index: number; is_open: boolean }[] = []
  // Pre-tournament: all open by default
  for (let i = 0; i < preDays; i++) {
    days.push({ period: 0, day_index: i, is_open: true })
  }
  // Week 1: only Tue/Wed/Thu (day_index 1,2,3 = Mon=0, Tue=1, Wed=2, Thu=3, Fri=4...)
  for (let i = 0; i < 7; i++) {
    days.push({ period: 1, day_index: i, is_open: i >= 1 && i <= 3 }) // Tue/Wed/Thu
  }
  // Week 2: all open
  for (let i = 0; i < 7; i++) {
    days.push({ period: 2, day_index: i, is_open: true })
  }
  // Week 3: all closed
  for (let i = 0; i < 7; i++) {
    days.push({ period: 3, day_index: i, is_open: false })
  }
  return days
}

function buildDefaultRegister4(): { period: number; is_active: boolean }[] {
  return [
    { period: 0, is_active: true },  // Pre-tournament: active
    { period: 1, is_active: false }, // Week 1: inactive
    { period: 2, is_active: true },  // Week 2: active
    { period: 3, is_active: false }, // Week 3: inactive
  ]
}

export default function SetupClient({
  settings,
  stadiumDays,
  register4,
}: {
  settings: TournamentSettings | null
  stadiumDays: StadiumOpenDay[]
  register4: Register4Config[]
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [year, setYear] = useState(settings?.year ?? new Date().getFullYear())
  const [startDate, setStartDate] = useState(settings?.start_date ?? '')
  const [preDays, setPreDays] = useState(settings?.pre_tournament_days ?? 3)

  // Stadium open days state: Map<`${period}-${day_index}`, boolean>
  const initStadium = () => {
    const map = new Map<string, boolean>()
    if (stadiumDays.length > 0) {
      stadiumDays.forEach(d => map.set(`${d.period}-${d.day_index}`, d.is_open))
    } else {
      buildDefaultStadiumDays(preDays).forEach(d => map.set(`${d.period}-${d.day_index}`, d.is_open))
    }
    return map
  }
  const [stadiumOpen, setStadiumOpen] = useState<Map<string, boolean>>(initStadium)

  // Register 4 state
  const initReg4 = () => {
    const map = new Map<number, boolean>()
    if (register4.length > 0) {
      register4.forEach(r => map.set(r.period, r.is_active))
    } else {
      buildDefaultRegister4().forEach(r => map.set(r.period, r.is_active))
    }
    return map
  }
  const [reg4Active, setReg4Active] = useState<Map<number, boolean>>(initReg4)

  function toggleStadium(period: number, dayIndex: number) {
    setStadiumOpen(prev => {
      const next = new Map(prev)
      const key = `${period}-${dayIndex}`
      next.set(key, !next.get(key))
      return next
    })
  }

  function toggleReg4(period: number) {
    setReg4Active(prev => {
      const next = new Map(prev)
      next.set(period, !next.get(period))
      return next
    })
  }

  // Get day labels for a period given current settings
  function getDayLabels(period: number): string[] {
    if (!startDate) return DAY_NAMES
    if (period === 0) {
      // Pre-tournament days: count back from week 1 start
      const weekStart = new Date(startDate + 'T00:00:00')
      return Array.from({ length: preDays }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() - (preDays - i))
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      })
    }
    // Weeks 1-3: Mon-Sun labels
    const offset = (period - 1) * 7
    const weekStart = new Date(startDate + 'T00:00:00')
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + offset + i)
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    })
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    const fd = new FormData()
    fd.set('year', String(year))
    fd.set('start_date', startDate)
    fd.set('pre_tournament_days', String(preDays))
    startTransition(async () => {
      await saveTournamentSettings(fd)
      setMessage('Tournament settings saved!')
    })
  }

  async function handleSaveStadium() {
    setMessage('')
    const openDays: { period: number; day_index: number; is_open: boolean }[] = []
    stadiumOpen.forEach((is_open, key) => {
      const [period, day_index] = key.split('-').map(Number)
      openDays.push({ period, day_index, is_open })
    })
    startTransition(async () => {
      await saveStadiumOpenDays(year, openDays)
      setMessage('Stadium schedule saved!')
    })
  }

  async function handleSaveReg4() {
    setMessage('')
    const configs: { period: number; is_active: boolean }[] = []
    reg4Active.forEach((is_active, period) => {
      configs.push({ period, is_active })
    })
    startTransition(async () => {
      await saveRegister4Config(year, configs)
      setMessage('Register 4 config saved!')
    })
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Tournament Basics */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Tournament Details</h2>
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
              <input
                type="number"
                value={year}
                onChange={e => setYear(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
                min={2020}
                max={2099}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Week 1 Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <p className="text-xs text-gray-400 mt-1">First Monday of the tournament</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Pre-tournament Days</label>
              <input
                type="number"
                value={preDays}
                onChange={e => setPreDays(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
                min={0}
                max={7}
              />
              <p className="text-xs text-gray-400 mt-1">Setup days before week 1</p>
            </div>
          </div>
          <button
            type="submit"
            disabled={pending || !startDate}
            className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition"
          >
            {pending ? 'Saving…' : 'Save Tournament Settings'}
          </button>
        </form>
      </div>

      {/* Stadium Open Days */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Stadium Open Days</h2>
            <p className="text-xs text-gray-400 mt-0.5">Check the days stadium is open each period</p>
          </div>
          <button
            onClick={handleSaveStadium}
            disabled={pending}
            className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition"
          >
            {pending ? 'Saving…' : 'Save Stadium Schedule'}
          </button>
        </div>

        <div className="space-y-4">
          {PERIODS.map(p => {
            const dayLabels = getDayLabels(p.id)
            const numDays = p.id === 0 ? preDays : 7
            return (
              <div key={p.id}>
                <div className="text-xs font-semibold text-gray-500 mb-2">{p.label}</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: numDays }, (_, i) => {
                    const key = `${p.id}-${i}`
                    const isOpen = stadiumOpen.get(key) ?? false
                    return (
                      <button
                        key={i}
                        onClick={() => toggleStadium(p.id, i)}
                        className={`px-4 py-2.5 min-h-[44px] min-w-[64px] rounded-lg text-sm font-semibold border transition active:scale-95 ${
                          isOpen
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-gray-100 text-gray-400 border-gray-200'
                        }`}
                      >
                        {dayLabels[i] ?? `Day ${i + 1}`}
                        <span className="ml-1">{isOpen ? '✓' : '✗'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Register 4 Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Register 4 Active</h2>
            <p className="text-xs text-gray-400 mt-0.5">Enable/disable Register 4 per period</p>
          </div>
          <button
            onClick={handleSaveReg4}
            disabled={pending}
            className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition"
          >
            {pending ? 'Saving…' : 'Save Register 4'}
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          {PERIODS.map(p => {
            const isActive = reg4Active.get(p.id) ?? false
            return (
              <button
                key={p.id}
                onClick={() => toggleReg4(p.id)}
                className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-semibold border transition active:scale-95 ${
                  isActive
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
              >
                {p.label} {isActive ? '✓ Active' : '✗ Inactive'}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
