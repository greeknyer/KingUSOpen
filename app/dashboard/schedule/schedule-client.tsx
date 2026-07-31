'use client'

import { useState, useTransition } from 'react'
import {
  Employee, ScheduleAssignment, TournamentSettings, OperatingHours, Register4Config,
  FOOD_VILLAGE_POSITIONS, STADIUM_POSITIONS, getTournamentDates, getPeriodForDate, formatTime, Position,
  Location, buildHoursMap, getHoursForDate, formatHoursRange,
  ShiftTemplate, SLOTS_PER_LOCATION, shiftsForDay, shiftLabel,
} from '@/lib/types'
import { autoSchedulePeriod, saveAssignment, removeAssignment, publishPeriod, clearDraftPeriod } from './actions'

const PERIOD_LABELS = ['Pre-tournament', 'Week 1', 'Week 2', 'Week 3']

// Slot rows each grid renders. Food Village runs three overlapping shifts;
// the Stadium tops out at two. Individual days may use fewer — those cells
// render as unavailable rather than as empty slots inviting an assignment.
const FV_SLOTS = Array.from({ length: SLOTS_PER_LOCATION.food_village }, (_, i) => i + 1)
const STADIUM_SLOTS = Array.from({ length: SLOTS_PER_LOCATION.stadium }, (_, i) => i + 1)

function AssignmentModal({
  date,
  location,
  position,
  slotOrder,
  year,
  existing,
  employees,
  onClose,
}: {
  date: string
  location: string
  position: Position
  slotOrder: number
  year: number
  existing?: ScheduleAssignment
  employees: Employee[]
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [empId, setEmpId] = useState(existing?.employee_id ?? '')
  const [start, setStart] = useState(existing?.planned_start?.slice(0, 5) ?? '')
  const [end, setEnd] = useState(existing?.planned_end?.slice(0, 5) ?? '')

  function handleSave() {
    startTransition(async () => {
      await saveAssignment({
        id: existing?.id,
        year,
        date,
        location,
        position,
        slot_order: slotOrder,
        employee_id: empId || null,
        planned_start: start || null,
        planned_end: end || null,
        status: 'draft',
      })
      onClose()
    })
  }

  function handleRemove() {
    if (!existing) return
    startTransition(async () => {
      await removeAssignment(existing.id)
      onClose()
    })
  }

  const d = new Date(date + 'T00:00:00')
  const posLabel = [...FOOD_VILLAGE_POSITIONS, ...STADIUM_POSITIONS].find(p => p.id === position)?.label ?? position

  return (
    // items-start + overflow-y-auto so the dialog stays reachable when the iPad
    // on-screen keyboard opens and halves the usable viewport height.
    <div className="fixed inset-0 bg-black/30 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md my-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{posLabel} · {shiftLabel(location as Location, slotOrder)}</h2>
            <p className="text-sm text-gray-400">{d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">Employee</label>
            <select
              value={empId}
              onChange={e => setEmpId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">— Unassigned —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.is_manager ? '(MGR)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">Start time</label>
              <input
                type="time"
                value={start}
                onChange={e => setStart(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">End time (blank = close)</label>
              <input
                type="time"
                value={end}
                onChange={e => setEnd(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={pending}
            className="flex-1 bg-gray-900 text-white text-sm font-semibold rounded-lg py-3 min-h-[48px] hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          {existing && (
            <button
              onClick={handleRemove}
              disabled={pending}
              className="px-4 bg-red-50 text-red-600 text-sm font-semibold rounded-lg py-3 min-h-[48px] hover:bg-red-100 active:bg-red-200 disabled:opacity-50 transition"
            >
              Remove
            </button>
          )}
          <button onClick={onClose} className="px-4 border border-gray-200 text-gray-600 text-sm rounded-lg py-3 min-h-[48px] hover:bg-gray-50 active:bg-gray-100 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function SlotCell({
  date, location, position, slotOrder, assignment, employees, onOpen
}: {
  date: string
  location: string
  position: Position
  slotOrder: number
  assignment?: ScheduleAssignment
  employees: Employee[]
  onOpen: () => void
}) {
  const emp = assignment?.employee_id ? employees.find(e => e.id === assignment.employee_id) : null

  return (
    <button
      onClick={onOpen}
      // min-h-[44px] keeps every cell a comfortable tap target — this is the
      // control you touch most when building a schedule on the iPad.
      className={`w-full text-left px-2 py-2 min-h-[44px] flex flex-col justify-center rounded-lg text-xs transition border active:scale-[0.97] ${
        assignment
          ? assignment.status === 'published'
            ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
            : 'bg-blue-50 border-blue-100 hover:bg-blue-100'
          : 'bg-gray-50 border-dashed border-gray-200 hover:bg-gray-100'
      }`}
    >
      {assignment && emp ? (
        <div>
          <div className="font-semibold text-gray-800 truncate">{emp.name}</div>
          <div className="text-gray-500 text-[11px]">
            {formatTime(assignment.planned_start)} → {formatTime(assignment.planned_end)}
          </div>
        </div>
      ) : (
        <span className="text-gray-300">+ Add</span>
      )}
    </button>
  )
}

export default function ScheduleClient({
  employees,
  assignments: initialAssignments,
  settings,
  operatingHours,
  register4Configs,
  shiftTemplates,
}: {
  employees: Employee[]
  assignments: ScheduleAssignment[]
  settings: TournamentSettings
  operatingHours: OperatingHours[]
  register4Configs: Register4Config[]
  shiftTemplates: ShiftTemplate[]
}) {
  const [activePeriod, setActivePeriod] = useState(1) // Default to week 1
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState<{
    date: string; location: string; position: Position; slotOrder: number; existing?: ScheduleAssignment
  } | null>(null)

  const { preTournament, week1, week2, week3 } = getTournamentDates(settings)
  const periodDates = [preTournament, week1, week2, week3]
  const currentDates = periodDates[activePeriod]
  const year = settings.year

  // Hours drive both the CLOSED markers and the per-day headers below.
  const hoursMap = buildHoursMap(operatingHours.filter(h => h.year === year))

  function hoursFor(location: Location, date: string) {
    return getHoursForDate(hoursMap, location, date, settings)
  }

  function isLocationOpen(location: Location, date: string): boolean {
    const h = hoursFor(location, date)
    // No row saved yet: Food Village is assumed open, Stadium assumed dark.
    return h ? h.is_open : location === 'food_village'
  }

  const yearTemplates = shiftTemplates.filter(t => t.year === year)

  const generalManager = employees.find(e => e.id === settings.general_manager_id)

  /** The shifts actually running for a location on a date. */
  function dayShifts(location: Location, date: string) {
    return shiftsForDay(location, hoursFor(location, date), yearTemplates)
  }

  /**
   * Whether a slot row applies to this date. Shift counts vary by day — the
   * Stadium runs one shift on a short or open-ended day and two on a long one —
   * so a row that has no shift on this date is shown as unavailable rather than
   * as an empty cell inviting an assignment.
   */
  function slotApplies(location: Location, date: string, slotOrder: number): boolean {
    return dayShifts(location, date).some(s => s.slot_order === slotOrder)
  }

  const reg4ActiveSet = new Set<string>()
  register4Configs.forEach(r => {
    if (r.year === year && r.is_active) {
      const dates = periodDates[r.period]
      if (dates) dates.forEach(d => reg4ActiveSet.add(d))
    }
  })

  function getAssignments(date: string, location: string, position: string): ScheduleAssignment[] {
    return initialAssignments.filter(a =>
      a.date === date && a.location === location && a.position === position
    ).sort((a, b) => a.slot_order - b.slot_order)
  }

  const hasDraft = initialAssignments.some(a => currentDates.includes(a.date) && a.status === 'draft')

  function handleAutoSchedule() {
    setMessage('')
    // Open days and shift times now come from the hours saved in Tournament
    // Setup, which autoSchedulePeriod reads directly.
    const reg4Dates = [...reg4ActiveSet].filter(d => currentDates.includes(d))
    startTransition(async () => {
      try {
        const { count, unfilled } = await autoSchedulePeriod(currentDates, year, reg4Dates)
        setMessage(
          unfilled > 0
            ? `Generated ${count} assignments as draft. ${unfilled} slot${unfilled === 1 ? '' : 's'} left empty — not enough available staff to cover every shift.`
            : `Generated ${count} assignments as draft.`
        )
      } catch (e) {
        setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown'}`)
      }
    })
  }

  function handlePublish() {
    setMessage('')
    startTransition(async () => {
      await publishPeriod(currentDates)
      setMessage('Published!')
    })
  }

  function handleClearDraft() {
    if (!confirm('Clear all draft entries for this period?')) return
    startTransition(async () => {
      await clearDraftPeriod(currentDates)
      setMessage('Draft cleared.')
    })
  }

  function formatDateHeader(date: string) {
    const d = new Date(date + 'T00:00:00')
    return {
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.getDate(),
      month: d.toLocaleDateString('en-US', { month: 'short' }),
    }
  }

  return (
    <div>
      {/* Period + Controls */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {PERIOD_LABELS.map((label, i) => (
            <button key={i} onClick={() => setActivePeriod(i)}
              className={`px-4 py-2.5 min-h-[44px] rounded-md text-sm font-semibold transition active:scale-95 ${
                activePeriod === i ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center gap-3 text-sm text-gray-500 mr-1">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-200 inline-block"></span>Draft</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-300 inline-block"></span>Published</span>
          </div>
          <button onClick={handleAutoSchedule} disabled={pending}
            className="px-4 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition">
            {pending ? 'Working…' : '⚡ Auto-Schedule'}
          </button>
          {hasDraft && (
            <>
              <button onClick={handlePublish} disabled={pending}
                className="px-4 py-2.5 min-h-[44px] bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 transition">
                Publish
              </button>
              <button onClick={handleClearDraft} disabled={pending}
                className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition">
                Clear Draft
              </button>
            </>
          )}
        </div>
      </div>

      {message && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-700">{message}</div>
      )}

      {/* The General Manager runs Food Village from outside the position grid,
          so they appear here rather than as a row that could be double-booked. */}
      {generalManager && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-purple-50 border border-purple-100 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-purple-200 text-purple-800">GM</span>
          <span className="text-sm font-semibold text-purple-900">{generalManager.name}</span>
          <span className="text-xs text-purple-600">
            On site at Food Village open to close, every open day — not counted toward position coverage.
          </span>
        </div>
      )}

      {/* Food Village Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 bg-amber-50">
          <span className="text-sm font-bold text-amber-900">Food Village</span>
          <span className="text-xs text-amber-600 ml-2">Hours set per day in Tournament Setup</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2 w-24 sticky left-0 bg-white">Position</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-2 py-2 w-14">Slot</th>
                {currentDates.map(date => {
                  const { weekday, date: d, month } = formatDateHeader(date)
                  const isOpen = isLocationOpen('food_village', date)
                  return (
                    <th key={date} className={`text-center text-xs px-1 py-2 font-semibold min-w-[110px] ${isOpen ? 'text-gray-500' : 'text-gray-300'}`}>
                      {weekday} {month} {d}
                      <div className="text-[11px] font-normal text-amber-600">
                        {formatHoursRange(hoursFor('food_village', date))}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {FOOD_VILLAGE_POSITIONS.map(pos => {
                const isReg4 = pos.id === 'register_4'
                return FV_SLOTS.map(slotOrder => {
                  const isFirstSlot = slotOrder === 1
                  return (
                    <tr key={`${pos.id}-${slotOrder}`} className={`border-t ${isFirstSlot ? 'border-gray-100' : 'border-gray-50'}`}>
                      {isFirstSlot && (
                        <td rowSpan={FV_SLOTS.length} className="px-4 py-1 align-middle sticky left-0 bg-white">
                          <div className="text-xs font-semibold text-gray-700">{pos.label}</div>
                          {isReg4 && <div className="text-[10px] text-gray-400">configurable</div>}
                        </td>
                      )}
                      <td className="px-2 py-1">
                        <span className="text-[10px] text-gray-400 font-semibold">{shiftLabel('food_village', slotOrder)}</span>
                      </td>
                      {currentDates.map(date => {
                        // Check if register 4 is active for this date
                        if (isReg4 && !reg4ActiveSet.has(date)) {
                          return isFirstSlot ? (
                            <td key={date} rowSpan={FV_SLOTS.length} className="px-1 py-1 align-middle">
                              <div className="min-h-[140px] rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center">
                                <span className="text-xs text-gray-300">Inactive</span>
                              </div>
                            </td>
                          ) : null
                        }
                        // A shift that isn't running this day gets no cell to fill.
                        if (!slotApplies('food_village', date, slotOrder)) {
                          return (
                            <td key={date} className="px-1 py-1">
                              <div className="min-h-[44px] rounded-lg bg-gray-50/60 flex items-center justify-center">
                                <span className="text-[10px] text-gray-300">—</span>
                              </div>
                            </td>
                          )
                        }
                        const existing = getAssignments(date, 'food_village', pos.id).find(a => a.slot_order === slotOrder)
                        return (
                          <td key={date} className="px-1 py-1">
                            <SlotCell
                              date={date}
                              location="food_village"
                              position={pos.id}
                              slotOrder={slotOrder}
                              assignment={existing}
                              employees={employees}
                              onOpen={() => setModal({ date, location: 'food_village', position: pos.id, slotOrder, existing })}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stadium Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-blue-50">
          <span className="text-sm font-bold text-blue-900">Stadium</span>
          <span className="text-xs text-blue-600 ml-2">Hours set per day in Tournament Setup</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2 w-28 sticky left-0 bg-white">Position</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-2 py-2 w-14">Slot</th>
                {currentDates.map(date => {
                  const { weekday, date: d, month } = formatDateHeader(date)
                  const isOpen = isLocationOpen('stadium', date)
                  return (
                    <th key={date} className={`text-center text-xs px-1 py-2 font-semibold min-w-[110px] ${isOpen ? 'text-gray-500' : 'text-gray-300'}`}>
                      {weekday} {month} {d}
                      <div className={`text-[11px] font-normal ${isOpen ? 'text-blue-600' : 'text-gray-300'}`}>
                        {formatHoursRange(hoursFor('stadium', date))}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {STADIUM_POSITIONS.map(pos => {
                return STADIUM_SLOTS.map(slotOrder => {
                  const isFirstSlot = slotOrder === 1
                  return (
                    <tr key={`${pos.id}-${slotOrder}`} className={`border-t ${isFirstSlot ? 'border-gray-100' : 'border-gray-50'}`}>
                      {isFirstSlot && (
                        <td rowSpan={STADIUM_SLOTS.length} className="px-4 py-1 align-middle sticky left-0 bg-white">
                          <div className="text-xs font-semibold text-gray-700">{pos.label}</div>
                        </td>
                      )}
                      <td className="px-2 py-1">
                        <span className="text-[10px] text-gray-400 font-semibold">{shiftLabel('stadium', slotOrder)}</span>
                      </td>
                      {currentDates.map(date => {
                        if (!isLocationOpen('stadium', date)) {
                          return isFirstSlot ? (
                            <td key={date} rowSpan={STADIUM_SLOTS.length} className="px-1 py-1 align-middle">
                              <div className="min-h-[92px] rounded-lg bg-gray-50 border border-dashed border-gray-100 flex items-center justify-center">
                                <span className="text-xs text-gray-200">CLOSED</span>
                              </div>
                            </td>
                          ) : null
                        }
                        // Short and open-ended Stadium days run a single shift,
                        // so slot #2 has nothing to fill on those dates.
                        if (!slotApplies('stadium', date, slotOrder)) {
                          return (
                            <td key={date} className="px-1 py-1">
                              <div className="min-h-[44px] rounded-lg bg-gray-50/60 flex items-center justify-center">
                                <span className="text-[10px] text-gray-300">—</span>
                              </div>
                            </td>
                          )
                        }
                        const existing = getAssignments(date, 'stadium', pos.id).find(a => a.slot_order === slotOrder)
                        return (
                          <td key={date} className="px-1 py-1">
                            <SlotCell
                              date={date}
                              location="stadium"
                              position={pos.id}
                              slotOrder={slotOrder}
                              assignment={existing}
                              employees={employees}
                              onOpen={() => setModal({ date, location: 'stadium', position: pos.id, slotOrder, existing })}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <AssignmentModal
          {...modal}
          year={year}
          employees={employees}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
