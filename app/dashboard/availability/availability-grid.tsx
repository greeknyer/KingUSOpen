'use client'

import { useState, useOptimistic, useTransition } from 'react'
import { Employee, Availability, TournamentSettings, getTournamentDates } from '@/lib/types'
import { toggleAvailability, setAllAvailable } from './actions'

type AvailMap = Map<string, boolean>

function buildAvailMap(avails: Availability[]): AvailMap {
  const map = new Map<string, boolean>()
  avails.forEach(a => map.set(`${a.employee_id}:${a.date}`, a.available))
  return map
}

function isAvailable(map: AvailMap, employeeId: string, date: string): boolean {
  const key = `${employeeId}:${date}`
  return map.has(key) ? map.get(key)! : true // default = available
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

  const [availMap, setOptimisticAvail] = useOptimistic(
    buildAvailMap(availabilities),
    (state: AvailMap, update: { key: string; value: boolean }) => {
      const next = new Map(state)
      next.set(update.key, update.value)
      return next
    }
  )

  const [activePeriod, setActivePeriod] = useState(0)
  const [, startTransition] = useTransition()

  const currentDates = periods[activePeriod].dates

  function handleToggle(employeeId: string, date: string) {
    const current = isAvailable(availMap, employeeId, date)
    startTransition(async () => {
      setOptimisticAvail({ key: `${employeeId}:${date}`, value: !current })
      await toggleAvailability(employeeId, date, current)
    })
  }

  function handleSetAll() {
    const employeeIds = employees.map(e => e.id)
    startTransition(async () => {
      await setAllAvailable(employeeIds, currentDates)
    })
  }

  return (
    <div>
      {/* Period tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
        {periods.map((p, i) => (
          <button
            key={i}
            onClick={() => setActivePeriod(i)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activePeriod === i ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {p.label}
            <span className="ml-1 text-gray-400">({p.dates.length}d)</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-emerald-200 border border-emerald-300 inline-block"></span>Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-red-100 border border-red-200 inline-block"></span>Unavailable
          </span>
          <span className="text-gray-400">(default = available)</span>
        </div>
        <button
          onClick={handleSetAll}
          className="text-xs text-gray-500 hover:text-gray-900 font-medium transition px-2 py-1 rounded hover:bg-gray-100"
        >
          Set all available
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5 w-36 sticky left-0 bg-white">Employee</th>
              {currentDates.map(date => {
                const d = new Date(date + 'T00:00:00')
                return (
                  <th key={date} className="text-center text-xs font-semibold text-gray-500 px-2 py-2.5 min-w-[60px]">
                    <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
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
                  <div className="text-xs font-semibold text-gray-900">{emp.name}</div>
                  {emp.role === 'manager' && (
                    <div className="text-[10px] text-purple-600 font-bold uppercase">MGR</div>
                  )}
                </td>
                {currentDates.map(date => {
                  const avail = isAvailable(availMap, emp.id, date)
                  return (
                    <td key={date} className="px-1 py-1.5 text-center">
                      <button
                        onClick={() => handleToggle(emp.id, date)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition hover:scale-110 ${
                          avail
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200'
                            : 'bg-red-50 text-red-400 border border-red-100 hover:bg-red-100'
                        }`}
                        title={avail ? 'Click to mark unavailable' : 'Click to mark available'}
                      >
                        {avail ? '✓' : '✗'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
