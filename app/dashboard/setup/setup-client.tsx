'use client'

import { useState, useTransition } from 'react'
import {
  TournamentSettings, OperatingHours, OptionalPositionConfig, Location, ShiftTemplate, Employee,
  DEFAULT_HOURS, DEFAULT_SHIFT_TEMPLATES, HANDOFF_MIN_HOURS, formatTime, hoursKey,
  OPTIONAL_POSITIONS, DEFAULT_KITCHEN_TEMPLATES,
  shiftsForDay, shiftLabel,
} from '@/lib/types'
import {
  saveTournamentSettings, saveOperatingHours, saveOptionalPositions, saveShiftTemplates,
} from './actions'

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

export default function SetupClient({
  settings,
  hours,
  register4,
  shiftTemplates,
  employees,
}: {
  settings: TournamentSettings | null
  hours: OperatingHours[]
  register4: OptionalPositionConfig[]
  shiftTemplates: ShiftTemplate[]
  employees: Employee[]
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [year, setYear] = useState(settings?.year ?? new Date().getFullYear())
  const [startDate, setStartDate] = useState(settings?.start_date ?? '')
  const [preDays, setPreDays] = useState(settings?.pre_tournament_days ?? 3)
  const [gmId, setGmId] = useState(settings?.general_manager_id ?? '')
  const [stadiumMgrId, setStadiumMgrId] = useState(settings?.stadium_manager_id ?? '')

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

  // Food Village shift templates. The Stadium is absent by design: its shifts
  // are derived from each day's hours instead (1 on a short or open-ended day,
  // 2 on a long one), so there is nothing to configure.
  type EditableTemplate = { slot_order: number; start_time: string; end_time: string }

  /**
   * Build a section's rows from its defaults, overlaid with whatever is saved.
   *
   * Starting from the defaults rather than from the saved rows matters: the
   * table always shows every shift the section runs, so a partially saved set
   * can't hide one. A missing MID row previously made the mid shift look like
   * it had been removed when it was only absent from the database.
   *
   * The section filter is exact. Reading every Food Village row regardless of
   * section pulled the kitchen's AM and PM in as if they were the defaults.
   */
  const buildTemplates = (
    section: string | null,
    defaults: { slot_order: number; start_time: string; end_time: string | null }[]
  ): EditableTemplate[] => {
    const saved = new Map(
      shiftTemplates
        .filter(t => t.location === 'food_village' && (t.section ?? null) === section)
        .map(t => [t.slot_order, t])
    )
    return defaults.map(d => {
      const row = saved.get(d.slot_order)
      return {
        slot_order: d.slot_order,
        start_time: row ? (row.start_time?.slice(0, 5) ?? '') : d.start_time,
        end_time: row ? (row.end_time?.slice(0, 5) ?? '') : (d.end_time ?? ''),
      }
    })
  }

  const [fvTemplates, setFvTemplates] = useState<EditableTemplate[]>(() =>
    buildTemplates(null, DEFAULT_SHIFT_TEMPLATES.food_village)
  )
  // The kitchen keeps its own times — it opens before the stand does.
  const [kitchenTemplates, setKitchenTemplates] = useState<EditableTemplate[]>(() =>
    buildTemplates('Kitchen', DEFAULT_KITCHEN_TEMPLATES)
  )

  function updateTemplate(slotOrder: number, patch: Partial<EditableTemplate>) {
    setFvTemplates(prev =>
      prev.map(t => (t.slot_order === slotOrder ? { ...t, ...patch } : t))
    )
  }

  function updateKitchen(slotOrder: number, patch: Partial<EditableTemplate>) {
    setKitchenTemplates(prev =>
      prev.map(t => (t.slot_order === slotOrder ? { ...t, ...patch } : t))
    )
  }

  async function handleSaveTemplates() {
    setMessage(''); setError('')
    startTransition(async () => {
      const r = await saveShiftTemplates(
        year,
        [
          ...fvTemplates.map(t => ({
            location: 'food_village',
            section: null as string | null,
            slot_order: t.slot_order,
            start_time: t.start_time,
            end_time: t.end_time || null,
          })),
          ...kitchenTemplates.map(t => ({
            location: 'food_village',
            section: 'Kitchen' as string | null,
            slot_order: t.slot_order,
            start_time: t.start_time,
            end_time: t.end_time || null,
          })),
        ]
      )
      if (r.ok) setMessage('Food Village shift times saved!')
      else setError(r.error)
    })
  }

  /** The in-progress template edits, shaped for shiftsForDay. */
  const liveTemplates: ShiftTemplate[] = fvTemplates.map((t, i) => ({
    id: String(i),
    year,
    location: 'food_village' as Location,
    section: null,
    slot_order: t.slot_order,
    start_time: t.start_time,
    end_time: t.end_time || null,
  }))

  /** Live preview of the templates against Week 1 day 1's hours. */
  const templatePreview = shiftsForDay(
    'food_village',
    {
      id: '', year, location: 'food_village', period: 1, day_index: 0,
      is_open: true,
      open_time: getDay('food_village', 1, 0).open_time || '10:00',
      close_time: getDay('food_village', 1, 0).close_time || null,
    },
    liveTemplates
  )

  // Register 4 state
  // Keyed `${position}:${period}`. Anything unsaved stays off, so a position is
  // never scheduled before someone has said it runs.
  const initOptional = () => {
    const map = new Map<string, boolean>()
    register4.forEach(r =>
      map.set(`${r.position ?? 'register_4'}:${r.period}`, r.is_active)
    )
    return map
  }
  const [optionalActive, setOptionalActive] = useState<Map<string, boolean>>(initOptional)

  function optionalOn(position: string, period: number): boolean {
    return optionalActive.get(`${position}:${period}`) ?? false
  }

  function toggleOptional(position: string, period: number) {
    setOptionalActive(prev => {
      const next = new Map(prev)
      const key = `${position}:${period}`
      next.set(key, !(next.get(key) ?? false))
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
    setMessage(''); setError('')
    const fd = new FormData()
    fd.set('year', String(year))
    fd.set('start_date', startDate)
    fd.set('pre_tournament_days', String(preDays))
    fd.set('general_manager_id', gmId)
    fd.set('stadium_manager_id', stadiumMgrId)
    startTransition(async () => {
      const r = await saveTournamentSettings(fd)
      if (r.ok) setMessage('Tournament settings saved!')
      else setError(r.error)
    })
  }

  async function handleSaveHours() {
    setMessage(''); setError('')
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
      const r = await saveOperatingHours(year, rows)
      if (r.ok) setMessage('Hours of operation saved!')
      else setError(r.error)
    })
  }

  async function handleSaveOptional() {
    setMessage(''); setError('')
    const configs: { period: number; position: string; is_active: boolean }[] = []
    for (const pos of OPTIONAL_POSITIONS)
      for (const p of PERIODS)
        configs.push({ period: p.id, position: pos.id, is_active: optionalOn(pos.id, p.id) })
    startTransition(async () => {
      const r = await saveOptionalPositions(year, configs)
      if (r.ok) setMessage('Optional positions saved!')
      else setError(r.error)
    })
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <div className="font-semibold mb-0.5">Not saved</div>
          {error}
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
          {/* Designated managers — one per location, fixed for the tournament */}
          <div className="pt-2 border-t border-gray-100">
            <div className="text-xs font-semibold text-gray-500 mb-1">Designated Managers</div>
            <p className="text-xs text-gray-400 mb-3">
              One per location for the whole tournament. Both are excluded from normal
              scheduling and work open to close on days their location is open.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">
                  General Manager — Food Village
                </label>
                <select
                  value={gmId}
                  onChange={e => setGmId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">— None —</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}{e.is_manager ? ' (MGR)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Runs the whole show — sits outside the position grid, so Food Village still
                  needs all its positions staffed.
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">
                  Stadium Manager
                </label>
                <select
                  value={stadiumMgrId}
                  onChange={e => setStadiumMgrId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">— None —</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}{e.is_manager ? ' (MGR)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Always at the Stadium, floating between Register and Prep depending on which
                  they&apos;re qualified for.
                </p>
              </div>
            </div>
            {gmId && gmId === stadiumMgrId && (
              <p className="text-xs text-red-600 mt-2">
                The same person can&apos;t manage both locations — they can only be in one place.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={pending || !startDate || (!!gmId && gmId === stadiumMgrId)}
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
                        // Food Village resolves against its templates; the
                        // Stadium splits its own hours. shiftsForDay does both.
                        const shifts = shiftsForDay(
                          loc.id,
                          {
                            id: '', year, location: loc.id,
                            period: activeHoursPeriod, day_index: i,
                            is_open: d.is_open,
                            open_time: d.open_time || null,
                            close_time: d.close_time || null,
                          },
                          loc.id === 'food_village' ? liveTemplates : []
                        )
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
                                      <span className="text-gray-400">{shiftLabel(loc.id, s.slot_order)}</span>{' '}
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

      {/* Food Village Shift Times */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Food Village Shift Times</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Three shifts run every open day. Leave <strong>Ends</strong> blank to run until that
              day&apos;s close. Times are clamped to each day&apos;s actual hours, so a day that opens
              late shifts the openers forward rather than starting before the doors open.
            </p>
          </div>
          <button
            onClick={handleSaveTemplates}
            disabled={pending}
            className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition shrink-0"
          >
            {pending ? 'Saving…' : 'Save Shift Times'}
          </button>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[460px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2 w-20">Shift</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Starts</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Ends</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {fvTemplates.map(t => (
                <tr key={t.slot_order} className="border-t border-gray-50">
                  <td className="px-4 py-2">
                    <span className="text-sm font-semibold text-gray-900">{shiftLabel('food_village', t.slot_order)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={t.start_time}
                      onChange={e => updateTemplate(t.slot_order, { start_time: e.target.value })}
                      className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] w-36 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={t.end_time}
                      onChange={e => updateTemplate(t.slot_order, { end_time: e.target.value })}
                      className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] w-36 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">
                    {t.end_time ? 'Hands off at end' : 'Runs to close'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5">
          <div className="text-sm font-bold text-gray-900 mb-1">Kitchen</div>
          <p className="text-xs text-gray-400 mb-2">
            Chef and Salads keep their own times — the kitchen is in before the stand
            opens so food is ready for the doors.
          </p>
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[460px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2 w-20">Shift</th>
                  <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Starts</th>
                  <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Ends</th>
                  <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Role</th>
                </tr>
              </thead>
              <tbody>
                {kitchenTemplates.map(t => (
                  <tr key={t.slot_order} className="border-t border-gray-50">
                    <td className="px-4 py-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {shiftLabel('food_village', t.slot_order)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        value={t.start_time}
                        onChange={e => updateKitchen(t.slot_order, { start_time: e.target.value })}
                        className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] w-36 focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        value={t.end_time}
                        onChange={e => updateKitchen(t.slot_order, { end_time: e.target.value })}
                        className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] w-36 focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {t.end_time ? 'Hands off at end' : 'Runs to close'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-100">
          <div className="text-xs font-semibold text-amber-900 mb-1">
            Preview — against Week 1 day 1&apos;s hours
          </div>
          {templatePreview.length === 0 ? (
            <div className="text-xs text-amber-700">
              No shifts — check that day is open and its hours are set.
            </div>
          ) : (
            <div className="text-xs text-amber-800 space-y-0.5">
              {templatePreview.map(s => (
                <div key={s.slot_order}>
                  <span className="text-amber-500">{shiftLabel('food_village', s.slot_order)}</span>{' '}
                  {formatTime(s.start)} → {formatTime(s.end)}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          The Stadium has no templates — its shifts come from each day&apos;s hours, giving one shift
          on a short or open-ended day and two once a day reaches {HANDOFF_MIN_HOURS} hours.
        </p>
      </div>

      {/* Optional positions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Optional Positions</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Positions that only run some weeks. Anything left off is never scheduled and
              never counted as an unfilled slot.
            </p>
          </div>
          <button
            onClick={handleSaveOptional}
            disabled={pending}
            className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition shrink-0"
          >
            {pending ? 'Saving…' : 'Save Optional Positions'}
          </button>
        </div>

        <div className="space-y-5">
          {OPTIONAL_POSITIONS.map(pos => (
            <div key={pos.id}>
              <div className="text-sm font-bold text-gray-900 mb-2">
                Food Village {pos.label}
              </div>
              <div className="flex flex-wrap gap-3">
                {PERIODS.map(p => {
                  const isActive = optionalOn(pos.id, p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleOptional(pos.id, p.id)}
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
          ))}
        </div>
      </div>
    </div>
  )
}
