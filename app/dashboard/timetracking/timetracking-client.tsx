'use client'

import { useState, useTransition } from 'react'
import { Employee, TimeEntry, TournamentSettings, getTournamentDates } from '@/lib/types'
import { saveTimeEntry } from './actions'

function TimeRow({
  employee,
  entry,
  date,
  year,
}: {
  employee: Employee
  entry?: TimeEntry
  date: string
  year: number
}) {
  const [pending, startTransition] = useTransition()
  const [inTime, setInTime] = useState(entry?.actual_in?.slice(0, 5) ?? '')
  const [outTime, setOutTime] = useState(entry?.actual_out?.slice(0, 5) ?? '')
  const [saved, setSaved] = useState(false)

  function calcHours(): string {
    if (!inTime || !outTime) return '—'
    const [inH, inM] = inTime.split(':').map(Number)
    const [outH, outM] = outTime.split(':').map(Number)
    const diff = (outH * 60 + outM) - (inH * 60 + inM)
    if (diff <= 0) return '—'
    const h = Math.floor(diff / 60)
    const m = diff % 60
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }

  function handleSave() {
    startTransition(async () => {
      await saveTimeEntry(year, employee.id, date, inTime || null, outTime || null, null, entry?.id)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const hoursDisplay = calcHours()

  return (
    <tr className="border-t border-gray-50">
      <td className="px-4 py-2.5">
        <div className="text-sm font-medium text-gray-900">{employee.name}</div>
        {employee.role === 'manager' && (
          <div className="text-[10px] text-purple-600 font-bold uppercase">MGR</div>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          type="time"
          value={inTime}
          onChange={e => { setInTime(e.target.value); setSaved(false) }}
          className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] w-36 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="time"
          value={outTime}
          onChange={e => { setOutTime(e.target.value); setSaved(false) }}
          className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] w-36 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </td>
      <td className="px-3 py-2">
        <span className={`text-sm font-semibold ${hoursDisplay === '—' ? 'text-gray-300' : 'text-gray-900'}`}>
          {hoursDisplay}
        </span>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={handleSave}
          disabled={pending}
          className={`px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-lg transition active:scale-95 ${
            saved
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
          }`}
        >
          {pending ? '…' : saved ? '✓ Saved' : 'Save'}
        </button>
      </td>
    </tr>
  )
}

export default function TimeTrackingClient({
  employees,
  entries,
  settings,
}: {
  employees: Employee[]
  entries: TimeEntry[]
  settings: TournamentSettings
}) {
  const { allDates } = getTournamentDates(settings)
  const today = new Date().toISOString().split('T')[0]
  const defaultDate = allDates.includes(today) ? today : (allDates[0] ?? today)
  const [selectedDate, setSelectedDate] = useState(defaultDate)

  const dayEntries = entries.filter(e => e.date === selectedDate)
  const entryMap = new Map(dayEntries.map(e => [e.employee_id, e]))

  const d = new Date(selectedDate + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const totalHours = dayEntries.reduce((sum, e) => sum + (e.hours_calculated ?? 0), 0)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Date</label>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {allDates.map(d => {
              const dd = new Date(d + 'T00:00:00')
              return (
                <option key={d} value={d}>
                  {dd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </option>
              )
            })}
          </select>
        </div>
        <div className="mt-5">
          <span className="text-sm text-gray-500">{dateLabel}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">Time Entries</span>
          {totalHours > 0 && (
            <span className="text-xs text-gray-500">Total: <span className="font-bold text-gray-900">{totalHours.toFixed(1)}h</span></span>
          )}
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5">Employee</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2.5">Clock In</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2.5">Clock Out</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2.5">Hours</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <TimeRow
                key={emp.id}
                employee={emp}
                entry={entryMap.get(emp.id)}
                date={selectedDate}
                year={settings.year}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
