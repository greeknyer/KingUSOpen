'use client'

import { useState, useTransition } from 'react'
import {
  Employee, Availability, TournamentSettings, getTournamentDates,
  patternShiftsOn, availableShiftsOn, worksFullDayOn, SHIFT_PERIODS, ShiftPeriod,
  weekdayIndex, DAY_LABELS,
} from '@/lib/types'
import {
  setAvailabilityShifts, resetAvailability, clearAvailabilityOverrides,
} from './actions'

function overrideKey(employeeId: string, date: string) {
  return `${employeeId}:${date}`
}

/** Compact cell label: ✓ for every shift, ✗ for none, otherwise the shifts. */
function cellLabel(shifts: ShiftPeriod[]): string {
  if (shifts.length === 0) return '✗'
  if (shifts.length === SHIFT_PERIODS.length) return '✓'
  return SHIFT_PERIODS.filter(s => shifts.includes(s.id)).map(s => s.label).join('/')
}

function sameShifts(a: ShiftPeriod[], b: ShiftPeriod[]): boolean {
  return a.length === b.length && a.every(s => b.includes(s))
}

/** Picker for one employee on one date. */
function ShiftPicker({
  employee, date, current, currentFullDay, isOverride, onClose,
}: {
  employee: Employee
  date: string
  current: ShiftPeriod[]
  currentFullDay: boolean
  isOverride: boolean
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ShiftPeriod[]>(current)
  const [fullDay, setFullDay] = useState(currentFullDay)

  const d = new Date(date + 'T00:00:00')
  const pattern = patternShiftsOn(employee, date)

  function toggle(s: ShiftPeriod) {
    setSelected(prev =>
      prev.includes(s)
        ? prev.filter(x => x !== s)
        : SHIFT_PERIODS.filter(p => [...prev, s].includes(p.id)).map(p => p.id)
    )
  }

  function save(shifts: ShiftPeriod[], asFullDay: boolean) {
    setError(null)
    startTransition(async () => {
      // A full day covers every shift, so store all three — the scheduler's
      // availability check then passes whichever slot it considers.
      const toSave = asFullDay ? SHIFT_PERIODS.map(s => s.id) : shifts
      const r = await setAvailabilityShifts(employee.id, date, toSave, asFullDay)
      if (r.ok) onClose()
      else setError(r.error)
    })
  }

  function reset() {
    setError(null)
    startTransition(async () => {
      const r = await resetAvailability(employee.id, date)
      if (r.ok) onClose()
      else setError(r.error)
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm my-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{employee.name}</h2>
            <p className="text-sm text-gray-400">
              {d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <div className="font-semibold mb-0.5">Not saved</div>
            {error}
          </div>
        )}

        <p className="text-xs text-gray-400 mb-3">
          Usual pattern for {DAY_LABELS[weekdayIndex(date)]}:{' '}
          <strong className="text-gray-600">
            {pattern.length === 0 ? 'Off' : cellLabel(pattern)}
          </strong>
          {isOverride && <span className="text-amber-600"> · changed for this date</span>}
        </p>

        <button
          onClick={() => setFullDay(v => !v)}
          className={`w-full mb-3 px-4 py-3 min-h-[52px] rounded-lg text-sm font-bold border transition active:scale-95 ${
            fullDay
              ? 'bg-blue-100 text-blue-800 border-blue-300'
              : 'bg-gray-100 text-gray-400 border-gray-200'
          }`}
        >
          {fullDay ? '✓ Full day — open to close' : 'Full day — open to close'}
        </button>

        <div className={`grid grid-cols-3 gap-2 mb-3 ${fullDay ? 'opacity-40 pointer-events-none' : ''}`}>
          {SHIFT_PERIODS.map(s => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`px-3 py-3 min-h-[52px] rounded-lg text-sm font-bold border transition active:scale-95 ${
                selected.includes(s.id)
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => save(selected, fullDay)}
            disabled={pending}
            className="flex-1 bg-gray-900 text-white text-sm font-semibold rounded-lg py-3 min-h-[48px] hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition"
          >
            {pending ? 'Saving…' : 'Save for this date'}
          </button>
          <button
            onClick={() => save([], false)}
            disabled={pending}
            className="px-4 bg-red-50 text-red-600 text-sm font-semibold rounded-lg py-3 min-h-[48px] hover:bg-red-100 active:bg-red-200 disabled:opacity-50 transition"
          >
            Off
          </button>
        </div>

        {isOverride && (
          <button
            onClick={reset}
            disabled={pending}
            className="w-full mt-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg py-3 min-h-[48px] hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition"
          >
            Reset to usual pattern
          </button>
        )}
      </div>
    </div>
  )
}

export default function AvailabilityGrid({
  employees,
  availabilities,
  settings,
}: {
  employees: Employee[]
  availabilities: Availability[]
  settings: TournamentSettings
}) {
  const { preTournament, week1, week2, week3 } = getTournamentDates(settings)
  const periods = [
    { label: 'Pre-tournament', dates: preTournament },
    { label: 'Week 1', dates: week1 },
    { label: 'Week 2', dates: week2 },
    { label: 'Week 3', dates: week3 },
  ]

  const [activePeriod, setActivePeriod] = useState(0)
  const [editing, setEditing] = useState<{ employee: Employee; date: string } | null>(null)
  const [, startTransition] = useTransition()

  const currentDates = periods[activePeriod].dates

  const overrides = new Map<string, Availability>()
  availabilities.forEach(a => overrides.set(overrideKey(a.employee_id, a.date), a))

  function shiftsFor(emp: Employee, date: string): ShiftPeriod[] {
    return availableShiftsOn(emp, date, overrides.get(overrideKey(emp.id, date)))
  }

  function fullDayFor(emp: Employee, date: string): boolean {
    return worksFullDayOn(emp, date, overrides.get(overrideKey(emp.id, date)))
  }

  /** An override only counts as a change when it differs from their usual. */
  function isChanged(emp: Employee, date: string): boolean {
    const row = overrides.get(overrideKey(emp.id, date))
    if (!row) return false
    if (row.full_day != null && row.full_day !== (emp.works_full_day ?? false)) return true
    return !sameShifts(shiftsFor(emp, date), patternShiftsOn(emp, date))
  }

  const changedCount = employees.reduce(
    (n, emp) => n + currentDates.filter(d => isChanged(emp, d)).length,
    0
  )

  function handleResetPeriod() {
    startTransition(async () => {
      await clearAvailabilityOverrides(employees.map(e => e.id), currentDates)
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
        {periods.map((p, i) => (
          <button
            key={i}
            onClick={() => setActivePeriod(i)}
            className={`px-4 py-2.5 min-h-[44px] rounded-md text-sm font-semibold transition active:scale-95 ${
              activePeriod === i ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {p.label}
            <span className="ml-1 text-gray-400">({p.dates.length}d)</span>
          </button>
        ))}
      </div>

      <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
        Filled in automatically from each employee&apos;s weekly pattern on the{' '}
        <strong>Employees</strong> screen. Tap a cell only where a specific date differs — for a
        week where someone drops to PM only, change just those dates.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200 inline-block"></span>
            From pattern
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-gray-100 border border-gray-200 inline-block"></span>
            Off
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-blue-100 border border-blue-200 inline-block"></span>
            Full day
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-amber-100 border-2 border-amber-400 inline-block"></span>
            Changed for this date
          </span>
        </div>
        <button
          onClick={handleResetPeriod}
          disabled={changedCount === 0}
          className="text-sm text-gray-500 hover:text-gray-900 font-medium transition px-4 py-2.5 min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200 disabled:opacity-40 shrink-0"
        >
          Reset {changedCount > 0 ? `${changedCount} change${changedCount === 1 ? '' : 's'}` : 'to pattern'}
        </button>
      </div>

      {/* Scrolls in both directions with the day header and the name column
          pinned, so it stays obvious which day and which person a cell belongs
          to once the grid is taller or wider than the screen. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[calc(100vh-19rem)] min-h-[14rem] overscroll-contain">
        <table className="w-full min-w-max">
          <thead>
            <tr>
              {/* Corner cell outranks both so neither scrolls over it. */}
              <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5 w-44 sticky top-0 left-0 z-30 bg-white shadow-[inset_0_-1px_0_rgb(229,231,235)]">
                Employee
              </th>
              {currentDates.map(date => {
                const d = new Date(date + 'T00:00:00')
                const weekend = weekdayIndex(date) >= 5
                return (
                  <th
                    key={date}
                    // Opaque background is load-bearing: rows scroll underneath.
                    className={`text-center text-xs font-semibold px-2 py-2.5 min-w-[70px] sticky top-0 z-20 shadow-[inset_0_-1px_0_rgb(229,231,235)] ${
                      weekend ? 'text-gray-400 bg-gray-50' : 'text-gray-500 bg-white'
                    }`}
                  >
                    <div>{DAY_LABELS[weekdayIndex(date)]}</div>
                    <div className="text-gray-400 font-normal">{d.getDate()}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id} className="border-t border-gray-50">
                <td className="px-4 py-2 sticky left-0 z-10 bg-white shadow-[inset_-1px_0_0_rgb(243,244,246)]">
                  <div className="text-sm font-semibold text-gray-900">{emp.name}</div>
                  {emp.is_manager && (
                    <div className="text-[11px] text-purple-600 font-bold uppercase">MGR</div>
                  )}
                </td>
                {currentDates.map(date => {
                  const shifts = shiftsFor(emp, date)
                  const changed = isChanged(emp, date)
                  const off = shifts.length === 0
                  // Full day only means anything on a day they're actually on.
                  const full = !off && fullDayFor(emp, date)
                  return (
                    <td key={date} className="px-1 py-1 text-center">
                      <button
                        onClick={() => setEditing({ employee: emp, date })}
                        className={`w-full min-w-[56px] h-11 rounded-lg text-xs font-bold transition active:scale-95 ${
                          changed
                            ? off
                              ? 'bg-amber-50 text-amber-500 border-2 border-amber-400'
                              : 'bg-amber-100 text-amber-800 border-2 border-amber-400'
                            : off
                              ? 'bg-gray-100 text-gray-300 border border-gray-200 hover:bg-gray-200'
                              : full
                                ? 'bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200'
                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200'
                        }`}
                        title={changed ? 'Changed for this date' : 'From their weekly pattern'}
                      >
                        {full ? 'FULL' : cellLabel(shifts)}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {employees.length === 0 && (
        <p className="text-sm text-gray-400 mt-4">No active employees yet.</p>
      )}

      {editing && (
        <ShiftPicker
          employee={editing.employee}
          date={editing.date}
          current={shiftsFor(editing.employee, editing.date)}
          currentFullDay={fullDayFor(editing.employee, editing.date)}
          isOverride={isChanged(editing.employee, editing.date)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
