'use client'

import { useState, useOptimistic, useTransition } from 'react'
import {
  Employee, Availability, TournamentSettings, getTournamentDates,
  patternAvailableOn, patternShiftsOn, SHIFT_PERIODS, weekdayIndex, DAY_LABELS,
} from '@/lib/types'
import { toggleAvailability, clearAvailabilityOverrides } from './actions'

/** Explicit per-date overrides, keyed `${employeeId}:${date}`. */
type OverrideMap = Map<string, boolean>

function buildOverrides(avails: Availability[]): OverrideMap {
  const map = new Map<string, boolean>()
  avails.forEach(a => map.set(`${a.employee_id}:${a.date}`, a.available))
  return map
}

/**
 * A date is available if an explicit override says so, otherwise it falls back
 * to the employee's standing weekly pattern. That fallback is the point of this
 * screen: someone set to Mon–Fri is already marked off every weekend without
 * anyone tapping a cell, so only genuine exceptions need touching.
 */
function isAvailable(overrides: OverrideMap, emp: Employee, date: string): boolean {
  const key = `${emp.id}:${date}`
  if (overrides.has(key)) return overrides.get(key)!
  return patternAvailableOn(emp, date)
}

function isOverridden(overrides: OverrideMap, emp: Employee, date: string): boolean {
  const key = `${emp.id}:${date}`
  if (!overrides.has(key)) return false
  return overrides.get(key)! !== patternAvailableOn(emp, date)
}

/** Short label for the shifts the pattern allows that day, e.g. "AM/PM". */
function shiftHint(emp: Employee, date: string): string {
  const on = patternShiftsOn(emp, date)
  if (on.length === SHIFT_PERIODS.length) return ''
  return SHIFT_PERIODS.filter(s => on.includes(s.id)).map(s => s.label).join('/')
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

  const [overrides, setOptimisticOverride] = useOptimistic(
    buildOverrides(availabilities),
    (state: OverrideMap, update: { key: string; value: boolean }) => {
      const next = new Map(state)
      next.set(update.key, update.value)
      return next
    }
  )

  const [activePeriod, setActivePeriod] = useState(0)
  const [, startTransition] = useTransition()

  const currentDates = periods[activePeriod].dates

  function handleToggle(emp: Employee, date: string) {
    const current = isAvailable(overrides, emp, date)
    startTransition(async () => {
      setOptimisticOverride({ key: `${emp.id}:${date}`, value: !current })
      await toggleAvailability(emp.id, date, current)
    })
  }

  function handleResetPeriod() {
    startTransition(async () => {
      await clearAvailabilityOverrides(employees.map(e => e.id), currentDates)
    })
  }

  const overrideCount = employees.reduce(
    (n, emp) => n + currentDates.filter(d => isOverridden(overrides, emp, d)).length,
    0
  )

  return (
    <div>
      {/* Period tabs */}
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
        Days are filled in automatically from each employee&apos;s weekly pattern on the{' '}
        <strong>Employees</strong> screen — someone set to Mon–Fri already shows as off every
        weekend. Only tap a cell when a specific date differs from their usual pattern.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200 inline-block"></span>
            Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-gray-100 border border-gray-200 inline-block"></span>
            Off (from pattern)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-amber-100 border-2 border-amber-400 inline-block"></span>
            Changed for this date
          </span>
        </div>
        <button
          onClick={handleResetPeriod}
          disabled={overrideCount === 0}
          className="text-sm text-gray-500 hover:text-gray-900 font-medium transition px-4 py-2.5 min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200 disabled:opacity-40 shrink-0"
        >
          Reset {overrideCount > 0 ? `${overrideCount} change${overrideCount === 1 ? '' : 's'}` : 'to pattern'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5 w-44 sticky left-0 bg-white">
                Employee
              </th>
              {currentDates.map(date => {
                const d = new Date(date + 'T00:00:00')
                const weekend = weekdayIndex(date) >= 5
                return (
                  <th
                    key={date}
                    className={`text-center text-xs font-semibold px-2 py-2.5 min-w-[64px] ${
                      weekend ? 'text-gray-400 bg-gray-50/60' : 'text-gray-500'
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
                <td className="px-4 py-2 sticky left-0 bg-white">
                  <div className="text-sm font-semibold text-gray-900">{emp.name}</div>
                  {emp.is_manager && (
                    <div className="text-[11px] text-purple-600 font-bold uppercase">MGR</div>
                  )}
                </td>
                {currentDates.map(date => {
                  const avail = isAvailable(overrides, emp, date)
                  const changed = isOverridden(overrides, emp, date)
                  const hint = avail ? shiftHint(emp, date) : ''
                  return (
                    <td key={date} className="px-1 py-1 text-center">
                      <button
                        onClick={() => handleToggle(emp, date)}
                        className={`w-11 h-11 rounded-lg text-xs font-bold transition active:scale-95 ${
                          avail
                            ? changed
                              ? 'bg-amber-100 text-amber-800 border-2 border-amber-400'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200'
                            : changed
                              ? 'bg-amber-50 text-amber-500 border-2 border-amber-400'
                              : 'bg-gray-100 text-gray-300 border border-gray-200 hover:bg-gray-200'
                        }`}
                        title={
                          changed
                            ? 'Changed for this date — tap to flip back'
                            : `From their weekly pattern — tap to change just this date`
                        }
                      >
                        {avail ? (hint || '✓') : '✗'}
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
    </div>
  )
}
