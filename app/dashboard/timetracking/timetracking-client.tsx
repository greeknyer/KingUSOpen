'use client'

import { useState, useTransition } from 'react'
import {
  Employee, TimeEntry, TournamentSettings, ScheduleAssignment, OperatingHours,
  getTournamentDates, buildHoursMap, getHoursForDate, formatTime, shiftLabel,
  FOOD_VILLAGE_POSITIONS, STADIUM_POSITIONS,
} from '@/lib/types'
import { saveTimeEntry, fillDayFromSchedule, clearUnscheduledEntries } from './actions'

/** What the schedule says an employee should work on a date. */
type Scheduled = {
  start: string
  end: string | null
  /** e.g. "Food Village · Register 1 · AM" */
  label: string
}

function positionLabel(position: string): string {
  return (
    [...FOOD_VILLAGE_POSITIONS, ...STADIUM_POSITIONS].find(p => p.id === position)?.label ??
    position
  )
}

function hoursBetween(timeIn: string, timeOut: string): number {
  const [inH, inM] = timeIn.split(':').map(Number)
  const [outH, outM] = timeOut.split(':').map(Number)
  let diff = outH * 60 + outM - (inH * 60 + inM)
  if (diff < 0) diff += 1440 // ran past midnight
  return diff / 60
}

function formatHours(timeIn: string, timeOut: string): string {
  const total = hoursBetween(timeIn, timeOut)
  if (total <= 0) return '—'
  const h = Math.floor(total)
  const m = Math.round((total - h) * 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function TimeRow({
  employee,
  entry,
  scheduled,
  date,
  year,
}: {
  employee: Employee
  entry?: TimeEntry
  scheduled: Scheduled | null
  date: string
  year: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // A saved entry wins; otherwise the scheduled shift is the starting point, so
  // an unchanged day is one tap rather than typing both times.
  const [inTime, setInTime] = useState(
    entry?.actual_in?.slice(0, 5) ?? scheduled?.start ?? ''
  )
  const [outTime, setOutTime] = useState(
    entry?.actual_out?.slice(0, 5) ?? scheduled?.end ?? ''
  )
  const [saved, setSaved] = useState(false)

  const isSaved = !!entry
  const differsFromSchedule =
    !!scheduled && (inTime !== scheduled.start || outTime !== (scheduled.end ?? ''))

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const r = await saveTimeEntry(
        year, employee.id, date, inTime || null, outTime || null, null, entry?.id
      )
      if (r.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        setError(r.error)
      }
    })
  }

  function resetToSchedule() {
    if (!scheduled) return
    setInTime(scheduled.start)
    setOutTime(scheduled.end ?? '')
    setSaved(false)
  }

  // Hours recorded against a day the schedule no longer has them on. Worth
  // showing differently from an ordinary unscheduled row, which is simply blank.
  const strandedHours = !scheduled && isSaved && (!!entry?.actual_in || !!entry?.actual_out)

  return (
    <tr className={`border-t border-gray-50 ${
      strandedHours ? 'bg-amber-50/70' : !scheduled ? 'bg-gray-50/40' : ''
    }`}>
      <td className="px-4 py-2.5 align-top">
        <div className="text-sm font-medium text-gray-900">{employee.name}</div>
        {employee.is_manager && (
          <div className="text-[10px] text-purple-600 font-bold uppercase">MGR</div>
        )}
        {error && <div className="text-[11px] text-red-600 mt-1">{error}</div>}
      </td>

      <td className="px-3 py-2.5 align-top">
        {scheduled ? (
          <div>
            <div className="text-xs text-gray-600">{scheduled.label}</div>
            <div className="text-[11px] text-gray-400">
              {formatTime(scheduled.start)} → {formatTime(scheduled.end)}
            </div>
          </div>
        ) : (
          <span className={`text-xs ${strandedHours ? 'text-amber-700 font-semibold' : 'text-gray-300'}`}>
            {strandedHours ? 'Not scheduled — hours left over' : 'Not scheduled'}
          </span>
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
        <span
          className={`text-sm font-semibold ${
            inTime && outTime ? 'text-gray-900' : 'text-gray-300'
          }`}
        >
          {inTime && outTime ? formatHours(inTime, outTime) : '—'}
        </span>
        {differsFromSchedule && (
          <div className="text-[10px] text-amber-600 font-semibold uppercase">Adjusted</div>
        )}
      </td>

      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            disabled={pending}
            className={`px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-lg transition active:scale-95 ${
              saved
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : isSaved
                  ? 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {pending ? '…' : saved ? '✓ Saved' : isSaved ? 'Update' : 'Save'}
          </button>
          {differsFromSchedule && (
            <button
              onClick={resetToSchedule}
              className="text-xs text-gray-400 hover:text-gray-900 px-2 py-2.5 min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200 transition"
              title="Put the scheduled times back"
            >
              Reset
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function TimeTrackingClient({
  employees,
  entries,
  assignments,
  operatingHours,
  settings,
}: {
  employees: Employee[]
  entries: TimeEntry[]
  assignments: ScheduleAssignment[]
  operatingHours: OperatingHours[]
  settings: TournamentSettings
}) {
  const { allDates } = getTournamentDates(settings)
  const today = new Date().toISOString().split('T')[0]
  const defaultDate = allDates.includes(today) ? today : (allDates[0] ?? today)
  const [selectedDate, setSelectedDate] = useState(defaultDate)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const hoursMap = buildHoursMap(operatingHours)

  const dayEntries = entries.filter(e => e.date === selectedDate)
  const entryMap = new Map(dayEntries.map(e => [e.employee_id, e]))

  /**
   * The shift the schedule has an employee on that date. A planned end of
   * "Close" is resolved against that location's closing time, since a clock-out
   * needs a real time and the day's hours already know it.
   */
  function scheduledFor(employeeId: string): Scheduled | null {
    const mine = assignments.filter(
      a => a.date === selectedDate && a.employee_id === employeeId && a.planned_start
    )
    if (mine.length === 0) return null

    const sorted = [...mine].sort((a, b) =>
      (a.planned_start ?? '').localeCompare(b.planned_start ?? '')
    )
    const first = sorted[0]
    const last = sorted[sorted.length - 1]

    let end = last.planned_end?.slice(0, 5) ?? null
    if (!end) {
      const h = getHoursForDate(hoursMap, last.location, selectedDate, settings)
      end = h?.close_time?.slice(0, 5) ?? null
    }

    const locLabel = first.location === 'food_village' ? 'Food Village' : 'Stadium'
    const label =
      sorted.length === 1
        ? `${locLabel} · ${positionLabel(first.position)} · ${shiftLabel(first.location, first.slot_order)}`
        : `${locLabel} · ${sorted.length} shifts`

    return { start: first.planned_start!.slice(0, 5), end, label }
  }

  const scheduledIds = new Set(
    employees.filter(e => scheduledFor(e.id) !== null).map(e => e.id)
  )
  // Scheduled staff first — they're who the manager is actually clocking.
  const ordered = [
    ...employees.filter(e => scheduledIds.has(e.id)),
    ...employees.filter(e => !scheduledIds.has(e.id)),
  ]

  const unsaved = [...scheduledIds].filter(id => !entryMap.has(id)).length

  /**
   * People with hours recorded who the schedule no longer has on this day.
   *
   * Entries outlive the shift that created them, so filling a day and then
   * moving somebody off it leaves their hours behind — and those hours go
   * through to payroll looking exactly like worked ones.
   */
  const stale = employees
    .filter(e => !scheduledIds.has(e.id))
    .map(e => ({ employee: e, entry: entryMap.get(e.id) }))
    .filter(r => r.entry && (r.entry.actual_in || r.entry.actual_out))

  const staleHours = stale.reduce((sum, r) => sum + (r.entry?.hours_calculated ?? 0), 0)

  function handleClearStale() {
    setMessage(''); setError('')
    const names = stale.map(r => r.employee.name).join(', ')
    if (!confirm(
      `Clear recorded hours for ${stale.length} person(s) not scheduled on this day?\n\n` +
      `${names}\n\n` +
      `${staleHours.toFixed(2)} hours will be removed from payroll. ` +
      `If any of them did work, leave this and correct the schedule instead.`
    )) return
    startTransition(async () => {
      const r = await clearUnscheduledEntries(
        settings.year, selectedDate, stale.map(s => s.employee.id)
      )
      if (r.ok) setMessage(`Cleared ${stale.length} entr${stale.length === 1 ? 'y' : 'ies'}.`)
      else setError(r.error)
    })
  }

  function handleFillAll() {
    setMessage(''); setError('')
    const rows = employees
      .map(e => ({ employee: e, sched: scheduledFor(e.id) }))
      .filter(r => r.sched && !entryMap.has(r.employee.id))
      .map(r => ({
        employee_id: r.employee.id,
        actual_in: r.sched!.start,
        actual_out: r.sched!.end,
      }))

    startTransition(async () => {
      const r = await fillDayFromSchedule(settings.year, selectedDate, rows)
      if (r.ok) setMessage(`Filled ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} from the schedule.`)
      else setError(r.error)
    })
  }

  const d = new Date(selectedDate + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  const totalHours = dayEntries.reduce((sum, e) => sum + (e.hours_calculated ?? 0), 0)

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Date</label>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {allDates.map(dd => {
              const dt = new Date(dd + 'T00:00:00')
              return (
                <option key={dd} value={dd}>
                  {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </option>
              )
            })}
          </select>
        </div>
        <span className="text-sm text-gray-500 pb-3">{dateLabel}</span>
        <button
          onClick={handleFillAll}
          disabled={pending || unsaved === 0}
          className="ml-auto px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-40 transition"
        >
          {pending ? 'Filling…' : `Fill ${unsaved || ''} from schedule`.trim()}
        </button>
      </div>

      {message && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <div className="font-semibold mb-0.5">Not saved</div>
          {error}
        </div>
      )}

      {/* Hours left behind by a schedule change. These reach payroll looking
          like worked hours, so they are called out rather than left to be
          spotted in a row that otherwise looks like any other. */}
      {stale.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold mb-0.5">
              {stale.length} {stale.length === 1 ? 'person has' : 'people have'} hours recorded but
              {stale.length === 1 ? " isn't" : " aren't"} scheduled today
            </div>
            <div className="text-xs">
              {stale.map(r => r.employee.name).join(', ')} — {staleHours.toFixed(2)}h in total.
              Left over from a shift that has since moved. If they did work, fix the schedule
              instead so the hours have something to match.
            </div>
          </div>
          <button
            onClick={handleClearStale}
            disabled={pending}
            className="shrink-0 px-4 py-2.5 min-h-[44px] bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 transition"
          >
            Clear {stale.length}
          </button>
        </div>
      )}

      <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
        Times start from what each person was scheduled for, so an ordinary day is just
        <strong> Fill from schedule</strong>. Change any row that ran long or short before saving —
        adjusted rows are marked so you can see what departed from the plan.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5">Employee</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2.5">Scheduled</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2.5">Clock In</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2.5">Clock Out</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2.5">Hours</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(emp => (
              <TimeRow
                // The saved entry is part of the key so clearing one remounts
                // the row. The inputs hold their own state, so without this the
                // cleared times would stay on screen until a reload.
                key={`${emp.id}:${selectedDate}:${entryMap.get(emp.id)?.id ?? 'none'}`}
                employee={emp}
                entry={entryMap.get(emp.id)}
                scheduled={scheduledFor(emp.id)}
                date={selectedDate}
                year={settings.year}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 px-1">
        <span className="text-xs text-gray-400">
          {scheduledIds.size} scheduled · {dayEntries.length} recorded
        </span>
        {totalHours > 0 && (
          <span className="text-sm text-gray-500">
            Total: <span className="font-bold text-gray-900">{totalHours.toFixed(1)}h</span>
          </span>
        )}
      </div>
    </div>
  )
}
