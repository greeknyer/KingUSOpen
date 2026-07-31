'use client'

import { useState, useTransition } from 'react'
import {
  TournamentSettings, OperatingHours, Register4Config, Location,
  DEFAULT_HOURS, HANDOFF_MIN_HOURS, planShifts, formatTime, hoursKey,
} from '@/lib/types'
import { saveTournamentSettings, saveOperatingHours, saveRegister4Config } from './actions'

const PERIODS = [
  { id: 0, label: 'Pre-tournament' },
  { id: 1, label: 'Week 1' },
  { id: 2, label: 'Week 2' },
  { id: 3, label: 'Week 3' },
]

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const LOCATIONS: { id: Location; label: string; accent: string }[] = [
  { id: 'food_village', label: 'Food Village', accent: 'amber' },
  { id: 'stadium', label: 'Stadium', accent: 'blue' },
]

/** Editable state for one location on one day. */
type DayHours = { is_open: boolean; open_time: string; close_time: string }

/** Stadium is dark on most days; Food Village runs throughout. */
function defaultIsOpen(location: Location, period: number, dayIndex: number): boolean {
  if (location === 'food_village') return true
  if (period === 0) return true                      // pre-tournament setup days
  if (period === 1) return dayIndex >= 1 && dayIndex <= 3  // Tue/Wed/Thu
  if (period === 2) return true
  return false                                        // week 3 dark
}

function defaultDayHours(location: Location, period: number, dayIndex: number): DayHours {
  return {
    is_open: defaultIsOpen(location, period, dayIndex),
    open_time: DEFAULT_HOURS[location].open,
    close_time: DEFAULT_HOURS[location].close,
  }
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
  hours,
  register4,
}: {
  settings: TournamentSettings | null
  hours: OperatingHours[]
  register4: Register4Config[]
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [year, setYear] = useState(settings?.year ?? new Date().getFullYear())
  const [startDate, setStartDate] = useState(settings?.start_date ?? '')
  const [preDays, setPreDays] = useState(settings?.pre_tournament_days ?? 3)

  // Hours state, keyed by `${location}:${period}:${dayIndex}`. Seeded from the
  // saved rows, falling back to sensible defaults for any day not yet stored —
  // so the grid is always complete even after pre_tournament_days changes.
  const initHours = () => {
    const saved = new Map<string, OperatingHours>()
    hours.forEach(h => saved.set(hoursKey(h.location, h.period, h.day_index), h))

    const map = new Map<string, DayHours>()
    for (const loc of LOCATIONS) {
      for (const p of PERIODS) {
        const numDays = p.id === 0 ? preDays : 7
        for (let i = 0; i < numDays; i++) {
          const key = hoursKey(loc.id, p.id, i)
          const row = saved.get(key)
          map.set(key, row
            ? {
                is_open: row.is_open,
                open_time: row.open_time ?? '',
                close_time: row.close_time ?? '',
              }
            : defaultDayHours(loc.id, p.id, i))
        }
      }
    }
    return map
  }
  const [dayHours, setDayHours] = useState<Map<string, DayHours>>(initHours)
  const [activeHoursPeriod, setActiveHoursPeriod] = useState(1)

  function updateDay(location: Location, period: number, dayIndex: number, patch: Partial<DayHours>) {
    setDayHours(prev => {
      const next = new Map(prev)
      const key = hoursKey(location, period, dayIndex)
      const current = next.get(key) ?? defaultDayHours(location, period, dayIndex)
      next.set(key, { ...current, ...patch })
      return next
    })
  }

  function getDay(location: Location, period: number, dayIndex: number): DayHours {
    return dayHours.get(hoursKey(location, period, dayIndex))
      ?? defaultDayHours(location, period, dayIndex)
  }

  /** Copy one day's hours (not its open/closed flag) across the whole period. */
  function applyToPeriod(location: Location, period: number, sourceIndex: number) {
    const source = getDay(location, period, sourceIndex)
    const numDays = period === 0 ? preDays : 7
    setDayHours(prev => {
      const next = new Map(prev)
      for (let i = 0; i < numDays; i++) {
        const key = hoursKey(location, period, i)
        const current = next.get(key) ?? defaultDayHours(location, period, i)
        next.set(key, {
          ...current,
          open_time: source.open_time,
          close_time: source.close_time,
        })
      }
      return next
    })
  }

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

  async function handleSaveHours() {
    setMessage('')
    const rows: {
      location: string; period: number; day_index: number
      is_open: boolean; open_time: string | null; close_time: string | null
    }[] = []

    for (const loc of LOCATIONS) {
      for (const p of PERIODS) {
        const numDays = p.id === 0 ? preDays : 7
        for (let i = 0; i < numDays; i++) {
          const d = getDay(loc.id, p.id, i)
          rows.push({
            location: loc.id,
            period: p.id,
            day_index: i,
            is_open: d.is_open,
            open_time: d.open_time || null,
            close_time: d.close_time || null,
          })
        }
      }
    }

    startTransition(async () => {
      await saveOperatingHours(year, rows)
      setMessage('Hours of operation saved!')
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
      setMessage('Food Village Register 4 config saved!')
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
                // Clearing a number input yields '', and parseInt('') is NaN —
                // which silently collapsed the Pre-tournament hours grid to zero
                // rows and would have saved "NaN". Clamp to a usable range.
                onChange={e => {
                  const n = parseInt(e.target.value)
                  setPreDays(Number.isNaN(n) ? 0 : Math.min(7, Math.max(0, n)))
                }}
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

      {/* Hours of Operation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Hours of Operation</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Set per day for each location. Leave <strong>Close</strong> blank for an open-ended day
              (e.g. Stadium 6pm → Close). Untick a day to mark it closed.
            </p>
          </div>
          <button
            onClick={handleSaveHours}
            disabled={pending}
            className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition shrink-0"
          >
            {pending ? 'Saving…' : 'Save Hours'}
          </button>
        </div>

        {/* Period tabs */}
        <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
          {PERIODS.map(p => {
            const days = p.id === 0 ? preDays : 7
            return (
              <button
                key={p.id}
                onClick={() => setActiveHoursPeriod(p.id)}
                className={`px-4 py-2.5 min-h-[44px] rounded-md text-sm font-semibold transition active:scale-95 ${
                  activeHoursPeriod === p.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
                <span className="ml-1 font-normal text-gray-400">({days}d)</span>
              </button>
            )
          })}
        </div>

        {activeHoursPeriod === 0 && preDays === 0 && (
          <div className="px-4 py-4 rounded-lg bg-amber-50 border border-amber-100 text-sm text-amber-800">
            There are no pre-tournament days to configure. Set{' '}
            <strong>Pre-tournament Days</strong> above to 1 or more, save, and they will appear here.
          </div>
        )}

        <div className="space-y-6">
          {LOCATIONS.map(loc => {
            const dayLabels = getDayLabels(activeHoursPeriod)
            const numDays = activeHoursPeriod === 0 ? preDays : 7
            if (numDays === 0) return null
            return (
              <div key={loc.id}>
                <div className={`px-4 py-2 rounded-t-lg border border-b-0 ${
                  loc.id === 'food_village'
                    ? 'bg-amber-50 border-amber-100'
                    : 'bg-blue-50 border-blue-100'
                }`}>
                  <span className={`text-sm font-bold ${
                    loc.id === 'food_village' ? 'text-amber-900' : 'text-blue-900'
                  }`}>{loc.label}</span>
                </div>

                <div className="border border-gray-200 rounded-b-lg overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2">Day</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2 w-24">Open?</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Opens</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Closes</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Shifts</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: numDays }, (_, i) => {
                        const d = getDay(loc.id, activeHoursPeriod, i)
                        const shifts = d.is_open
                          ? planShifts(d.open_time || null, d.close_time || null)
                          : []
                        return (
                          <tr key={i} className={`border-t border-gray-50 ${d.is_open ? '' : 'bg-gray-50/60'}`}>
                            <td className="px-4 py-2">
                              <span className={`text-sm font-medium ${d.is_open ? 'text-gray-900' : 'text-gray-400'}`}>
                                {dayLabels[i] ?? `Day ${i + 1}`}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => updateDay(loc.id, activeHoursPeriod, i, { is_open: !d.is_open })}
                                className={`w-11 h-11 rounded-lg text-sm font-bold border transition active:scale-95 ${
                                  d.is_open
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                    : 'bg-gray-100 text-gray-400 border-gray-200'
                                }`}
                                title={d.is_open ? 'Open — tap to close' : 'Closed — tap to open'}
                              >
                                {d.is_open ? '✓' : '✗'}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={d.open_time}
                                disabled={!d.is_open}
                                onChange={e => updateDay(loc.id, activeHoursPeriod, i, { open_time: e.target.value })}
                                className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] w-36 disabled:bg-gray-100 disabled:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={d.close_time}
                                disabled={!d.is_open}
                                onChange={e => updateDay(loc.id, activeHoursPeriod, i, { close_time: e.target.value })}
                                placeholder="Close"
                                className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] w-36 disabled:bg-gray-100 disabled:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900"
                              />
                            </td>
                            <td className="px-3 py-2">
                              {!d.is_open ? (
                                <span className="text-xs text-gray-300">Closed</span>
                              ) : shifts.length === 0 ? (
                                <span className="text-xs text-gray-300">—</span>
                              ) : (
                                <div className="text-[11px] text-gray-500 leading-tight">
                                  {shifts.map((s, n) => (
                                    <div key={n}>
                                      <span className="text-gray-400">#{n + 1}</span>{' '}
                                      {formatTime(s.start)} → {formatTime(s.end)}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => applyToPeriod(loc.id, activeHoursPeriod, i)}
                                className="text-xs text-gray-400 hover:text-gray-900 font-medium px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200 transition whitespace-nowrap"
                                title="Copy these hours to every day in this period"
                              >
                                Apply to period
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Auto-Schedule splits a day into two handoff shifts when it runs {HANDOFF_MIN_HOURS} hours
          or longer. Shorter days, and days ending in “Close”, stay a single shift — so a 6pm → Close
          Stadium day is one evening shift rather than a handoff at midnight.
        </p>
      </div>

      {/* Register 4 Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Food Village Register 4 Active</h2>
            <p className="text-xs text-gray-400 mt-0.5">Enable/disable the Food Village’s fourth register per period</p>
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
