'use client'

import { Fragment, useState, useTransition } from 'react'
import {
  Employee, ScheduleAssignment, TournamentSettings, OperatingHours, OptionalPositionConfig,
  FOOD_VILLAGE_POSITIONS, STADIUM_POSITIONS, getTournamentDates, getPeriodForDate, formatTime, Position,
  Location, buildHoursMap, getHoursForDate, formatHoursRange,
  ShiftTemplate, SLOTS_PER_LOCATION, shiftsForDay, shiftLabel, positionRunsSlot,
  buildPeriodShiftMap, positionRunsSlotInPeriod, positionOpenInPeriod,
  Availability, availableShiftsOn, worksFullDayOn, shiftLengthHours, canWorkLocation,
  skillLabel, SKILLS, LOCATION_LABELS, canWorkAnyPosition, canWorkOn, shiftPeriodFor,
  patternShiftsOn, weekdayIndex, DAY_LABELS,
} from '@/lib/types'
import { autoSchedulePeriod, saveAssignment, removeAssignment, publishPeriod, unpublishPeriod, clearDraftPeriod } from './actions'

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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [empId, setEmpId] = useState(existing?.employee_id ?? '')
  const [start, setStart] = useState(existing?.planned_start?.slice(0, 5) ?? '')
  const [end, setEnd] = useState(existing?.planned_end?.slice(0, 5) ?? '')

  function handleSave() {
    startTransition(async () => {
      const r = await saveAssignment({
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
      // Stay open on failure rather than closing over a change that didn't save.
      if (r.ok) onClose()
      else setSaveError(r.error)
    })
  }

  function handleRemove() {
    if (!existing) return
    startTransition(async () => {
      const r = await removeAssignment(existing.id)
      if (r.ok) onClose()
      else setSaveError(r.error)
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

        {saveError && (
          <div className="mb-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <div className="font-semibold mb-0.5">Not saved</div>
            {saveError}
          </div>
        )}

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
          // An unfilled slot is the thing worth spotting on this screen, so it
          // reads as a gap rather than as quiet empty space.
          : 'bg-red-50 border-red-200 hover:bg-red-100'
      }`}
    >
      {assignment && emp ? (
        <div>
          <div className="font-semibold text-gray-800 truncate">
            {emp.name}
            {assignment.is_full_day && (
              <span className="ml-1 text-[9px] font-bold text-blue-600 align-middle">FULL</span>
            )}
          </div>
          <div className="text-gray-500 text-[11px]">
            {formatTime(assignment.planned_start)} → {formatTime(assignment.planned_end)}
          </div>
        </div>
      ) : (
        <span className="text-red-400 font-semibold">+ Add</span>
      )}
    </button>
  )
}

export default function ScheduleClient({
  employees,
  assignments: initialAssignments,
  availability,
  settings,
  operatingHours,
  register4Configs,
  shiftTemplates,
}: {
  employees: Employee[]
  assignments: ScheduleAssignment[]
  availability: Availability[]
  settings: TournamentSettings
  operatingHours: OperatingHours[]
  register4Configs: OptionalPositionConfig[]
  shiftTemplates: ShiftTemplate[]
}) {
  const [activePeriod, setActivePeriod] = useState(1) // Default to week 1
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [showSummary, setShowSummary] = useState(false)
  const [openPerson, setOpenPerson] = useState<string | null>(null)
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

  // A Stadium manager given no positions supervises rather than working one, so
  // they sit outside the grid like the GM rather than taking up a slot.
  const stadiumManager = employees.find(e => e.id === settings.stadium_manager_id)
  const stadiumManagerOffGrid =
    stadiumManager && !canWorkAnyPosition(stadiumManager, 'stadium') ? stadiumManager : undefined

  /** The shifts actually running for a location on a date. */
  function dayShifts(location: Location, date: string) {
    return shiftsForDay(location, hoursFor(location, date), yearTemplates)
  }

  /**
   * A position held open to close by one person. Its later shifts need nobody,
   * so they render as covered rather than as gaps.
   */
  function fullDayHolder(location: Location, date: string, position: string) {
    return initialAssignments.find(
      a =>
        a.date === date &&
        a.location === location &&
        a.position === position &&
        a.is_full_day &&
        a.employee_id
    )
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

  // Dates each optional position runs, keyed by position id.
  const optionalActiveDates = new Map<string, Set<string>>()
  register4Configs.forEach(r => {
    if (r.year !== year || !r.is_active) return
    const dates = periodDates[r.period]
    if (!dates) return
    // Rows written before Prep 4 existed carry no position; they're Register 4.
    const key = r.position ?? 'register_4'
    if (!optionalActiveDates.has(key)) optionalActiveDates.set(key, new Set())
    dates.forEach(d => optionalActiveDates.get(key)!.add(d))
  })

  function positionActive(position: string, date: string): boolean {
    return optionalActiveDates.get(position)?.has(date) ?? false
  }

  // Which shifts each position runs in the period on screen.
  const periodShiftMap = buildPeriodShiftMap(register4Configs.filter(r => r.year === year))

  function runsSlot(location: Location, position: Position, slotOrder: number): boolean {
    return location === 'food_village'
      ? positionRunsSlotInPeriod(periodShiftMap, location, position, slotOrder, activePeriod)
      : positionRunsSlot(location, position, slotOrder)
  }

  function openThisPeriod(position: Position): boolean {
    return positionOpenInPeriod(periodShiftMap, position, activePeriod)
  }

  function getAssignments(date: string, location: string, position: string): ScheduleAssignment[] {
    return initialAssignments.filter(a =>
      a.date === date && a.location === location && a.position === position
    ).sort((a, b) => a.slot_order - b.slot_order)
  }

  const hasDraft = initialAssignments.some(a => currentDates.includes(a.date) && a.status === 'draft')
  const hasPublished = initialAssignments.some(a => currentDates.includes(a.date) && a.status === 'published')

  /**
   * Slots in this period with nobody in them. Counts only rows that genuinely
   * need someone — skipping closed days, inactive Register 4, shifts that day
   * doesn't run, and positions already held by one person all day.
   */
  function countUnfilled(location: Location): number {
    const positions = location === 'food_village' ? FOOD_VILLAGE_POSITIONS : STADIUM_POSITIONS
    const slotNums = location === 'food_village' ? FV_SLOTS : STADIUM_SLOTS
    let missing = 0
    for (const date of currentDates) {
      if (!isLocationOpen(location, date)) continue
      for (const pos of positions) {
        if (pos.configurable && !positionActive(pos.id, date)) continue
        const holder = fullDayHolder(location, date, pos.id)
        for (const slotOrder of slotNums) {
          if (!runsSlot(location, pos.id, slotOrder)) continue
          if (holder && holder.slot_order !== slotOrder) continue
          if (!slotApplies(location, date, slotOrder)) continue
          const filled = getAssignments(date, location, pos.id).some(
            a => a.slot_order === slotOrder && a.employee_id
          )
          if (!filled) missing++
        }
      }
    }
    return missing
  }

  const fvUnfilled = countUnfilled('food_village')
  const stadiumUnfilled = countUnfilled('stadium')

  // ── Staffing summary ──────────────────────────────────────────────
  //
  // Auto-Schedule is deterministic, so re-running it can never change who got
  // what — which makes a surprising day count look arbitrary when it is in fact
  // forced by an input. This works out, per person, what they got and what was
  // holding them back, so the answer is on screen rather than inferred.

  const availMap = new Map<string, Availability>()
  availability.forEach(a => availMap.set(`${a.employee_id}:${a.date}`, a))

  /** Length of an assignment, resolving an open-ended end to the day's close. */
  function assignmentHours(a: ScheduleAssignment): number {
    const end = a.planned_end ?? hoursFor(a.location as Location, a.date)?.close_time ?? null
    return shiftLengthHours(a.planned_start, end)
  }

  const periodAssignments = initialAssignments.filter(
    a => currentDates.includes(a.date) && a.employee_id
  )

  /**
   * Every slot running on a date that this person could be put in.
   *
   * The same three tests the scheduler applies — position, location, shift —
   * so what this reports is what it saw. A position somebody holds open to
   * close is excluded: it runs no separate shifts that day.
   */
  function slotsOpenTo(e: Employee, date: string) {
    const out: { location: Location; position: Position; slotOrder: number; taken: boolean }[] = []
    const shifts = availableShiftsOn(e, date, availMap.get(`${e.id}:${date}`))

    for (const location of ['food_village', 'stadium'] as Location[]) {
      if (!canWorkLocation(e, location) || !isLocationOpen(location, date)) continue
      const positions = location === 'food_village' ? FOOD_VILLAGE_POSITIONS : STADIUM_POSITIONS
      for (const pos of positions) {
        if (!canWorkOn(e, pos.id, availMap.get(`${e.id}:${date}`))) continue
        const holder = fullDayHolder(location, date, pos.id)
        const slotNums = location === 'food_village' ? FV_SLOTS : STADIUM_SLOTS
        for (const slotOrder of slotNums) {
          if (!runsSlot(location, pos.id, slotOrder)) continue
          if (!slotApplies(location, date, slotOrder)) continue
          if (holder && holder.slot_order !== slotOrder) continue
          if (!shifts.includes(shiftPeriodFor(location, slotOrder))) continue
          const taken = getAssignments(date, location, pos.id).some(
            a => a.slot_order === slotOrder && a.employee_id
          )
          out.push({ location, position: pos.id, slotOrder, taken })
        }
      }
    }
    return out
  }

  const positionLabel = (id: string) =>
    [...FOOD_VILLAGE_POSITIONS, ...STADIUM_POSITIONS].find(p => p.id === id)?.label ?? id

  /** What happened to one person on one date, and why. */
  function dayDetail(e: Employee, date: string): { tone: 'on' | 'off' | 'gap'; text: string } {
    const mine = initialAssignments.find(a => a.date === date && a.employee_id === e.id)
    if (mine) {
      return {
        tone: 'on',
        text: `${positionLabel(mine.position)} · ${formatTime(mine.planned_start)}–${formatTime(mine.planned_end)}` +
          (mine.is_full_day ? ' (full day)' : ''),
      }
    }

    const openSomewhere =
      (canWorkLocation(e, 'food_village') && isLocationOpen('food_village', date)) ||
      (canWorkLocation(e, 'stadium') && isLocationOpen('stadium', date))
    if (!openSomewhere) return { tone: 'off', text: 'nothing open' }

    // "Not available" comes from one of two places and they're fixed on
    // different screens, so say which. A standing pattern with no shifts on
    // this weekday is an Employees setting; a date that differs from it is an
    // Availability one, and it keeps whatever it was set to even after the
    // pattern changes — which is how someone stays off a day they now work.
    const override = availMap.get(`${e.id}:${date}`)
    if (availableShiftsOn(e, date, override).length === 0) {
      const patternShifts = patternShiftsOn(e, date)
      const weekday = DAY_LABELS[weekdayIndex(date)]
      if (override && patternShifts.length > 0) {
        return { tone: 'gap', text: `turned off for this date — fix on Availability` }
      }
      return { tone: 'off', text: `no ${weekday} in their weekly pattern` }
    }

    const cap = e.is_manager ? null : e.max_shifts_per_week
    const worked = new Set(periodAssignments.filter(a => a.employee_id === e.id).map(a => a.date)).size
    if (cap != null && worked >= cap) return { tone: 'gap', text: `at ${cap}-shift cap` }

    const slots = slotsOpenTo(e, date)
    if (slots.length === 0) {
      return {
        tone: 'gap',
        text: (e.skills ?? []).length === 0
          ? 'no positions set'
          : 'nothing they cover runs today',
      }
    }
    const free = slots.filter(s => !s.taken)
    if (free.length > 0) {
      return { tone: 'gap', text: `${free.length} slot(s) free — re-run Auto-Schedule` }
    }
    // The honest answer when the day is simply full: name what they cover and
    // how many of it there was, since that is the number to change.
    const names = [...new Set(slots.map(s => positionLabel(s.position)))]
    return { tone: 'gap', text: `all ${slots.length} slot(s) taken — ${names.join(', ')}` }
  }

  const summary = employees
    .map(e => {
      const mine = periodAssignments.filter(a => a.employee_id === e.id)
      const days = new Set(mine.map(a => a.date)).size
      const hours = mine.reduce((sum, a) => sum + assignmentHours(a), 0)
      const fullDays = mine.filter(a => a.is_full_day).length

      // Days they could have worked: somewhere open that they're cleared for,
      // with their pattern or that date's override leaving them free.
      const freeDays = currentDates.filter(d => {
        const openSomewhere =
          (canWorkLocation(e, 'food_village') && isLocationOpen('food_village', d)) ||
          (canWorkLocation(e, 'stadium') && isLocationOpen('stadium', d))
        if (!openSomewhere) return false
        return availableShiftsOn(e, d, availMap.get(`${e.id}:${d}`)).length > 0
      }).length

      const cap = e.is_manager ? null : e.max_shifts_per_week
      const worksFull = currentDates.some(d =>
        worksFullDayOn(e, d, availMap.get(`${e.id}:${d}`))
      )

      // The single thing most responsible for the day count, in the order the
      // scheduler applies them — a cap it will not cross, then hours it is
      // balancing against, then slots it simply ran out of.
      // An agreed number of days can't be met beyond the days they're free, so
      // it's measured against those rather than flagged as short every period.
      const promised = e.min_shifts_per_week
      const owedTarget = promised == null ? null : Math.min(promised, freeDays)

      let reason = ''
      let tone: 'flat' | 'warn' | 'stop' = 'flat'
      if (owedTarget != null && days < owedTarget) {
        reason = `${owedTarget - days} short of their ${promised}-day agreement`
        tone = 'stop'
      } else if (e.id === settings.general_manager_id) {
        reason = 'GM — runs Food Village outside the grid'
      } else if (e.id === settings.stadium_manager_id) {
        reason = canWorkAnyPosition(e, 'stadium')
          ? 'Stadium manager — fixed at the Stadium'
          : 'Stadium manager — supervises, no positions set'
      } else if ((e.skills ?? []).length === 0) {
        reason = 'No positions set — nothing they can be scheduled for'
        tone = 'stop'
      } else if (freeDays === 0) {
        reason = 'Not available any day this period'
        tone = 'stop'
      } else if (cap != null && days >= cap) {
        reason = `At their ${cap}-shift weekly cap`
        tone = 'stop'
      } else if (fullDays > 0 && days < freeDays) {
        reason = `${fullDays} full day${fullDays === 1 ? '' : 's'} — long days, so fewer of them`
        tone = 'warn'
      } else if (days < freeDays) {
        reason = `${freeDays - days} free day${freeDays - days === 1 ? '' : 's'} unused — no slot left they could fill`
        tone = 'warn'
      }

      return { e, days, hours, freeDays, cap, worksFull, promised, reason, tone }
    })
    // Whoever got least is what you came to this table to look at.
    .sort((a, b) => a.days - b.days || b.freeDays - a.freeDays)

  /**
   * The same people grouped by the station they cover, because moving somebody
   * by hand means finding cover for one position — so the useful question is
   * who else can work a register, not who is idle across the whole crew.
   *
   * Anyone qualified for several stations appears under each of them. That is
   * the point: they are the people who can be moved between stations, and the
   * spare capacity in one is often standing in another.
   */
  const stations = [
    ...SKILLS.map(skill => ({
      id: skill.id as string,
      label: skill.label,
      people: summary.filter(r => (r.e.skills ?? []).includes(skill.id)),
    })),
    {
      id: 'none',
      label: 'No positions set',
      people: summary.filter(r => (r.e.skills ?? []).length === 0),
    },
  ].filter(g => g.people.length > 0)

  function handleAutoSchedule() {
    setMessage('')
    // Open days and shift times now come from the hours saved in Tournament
    // Setup, which autoSchedulePeriod reads directly.
    const activeDates: Record<string, string[]> = {}
    for (const [position, dates] of optionalActiveDates)
      activeDates[position] = currentDates.filter(d => dates.has(d))
    startTransition(async () => {
      try {
        const result = await autoSchedulePeriod(currentDates, year, activeDates)
        if ('error' in result && result.error) {
          setMessage(`Nothing was saved — ${result.error}`)
          return
        }
        const { count, unfilled } = result
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
      const r = await publishPeriod(currentDates)
      setMessage(r.ok ? 'Published!' : `Nothing was published — ${r.error}`)
    })
  }

  function handleUnpublish() {
    setMessage('')
    startTransition(async () => {
      const r = await unpublishPeriod(currentDates)
      setMessage(
        r.ok
          ? 'Back to draft — nothing was lost. Publish again when you’re ready.'
          : `Nothing was unpublished — ${r.error}`
      )
    })
  }

  function handleClearDraft() {
    if (!confirm('Clear all draft entries for this period?')) return
    startTransition(async () => {
      const r = await clearDraftPeriod(currentDates)
      if (!r.ok) { setMessage(`Nothing was cleared — ${r.error}`); return }
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
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mr-1">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-200 inline-block"></span>Draft</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-300 inline-block"></span>Published</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block"></span>Not filled</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-200 inline-block"></span>Covered all day</span>
          </div>
          <button onClick={handleAutoSchedule} disabled={pending}
            className="px-4 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition">
            {pending ? 'Working…' : '⚡ Auto-Schedule'}
          </button>
          {/* A sheet for the board, without the editing chrome. */}
          <a href={`/dashboard/schedule/print?period=${activePeriod}`} target="_blank" rel="noopener"
            className="px-4 py-2.5 min-h-[44px] flex items-center border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 active:bg-gray-100 transition">
            🖨 Print
          </a>
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
          {/* Undo for a Publish pressed by mistake. Nothing is deleted — the
              rows go back to draft, so publishing again restores them. */}
          {hasPublished && (
            <button onClick={handleUnpublish} disabled={pending}
              className="px-4 py-2.5 min-h-[44px] border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold rounded-lg hover:bg-amber-100 active:bg-amber-200 disabled:opacity-50 transition">
              Unpublish
            </button>
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

      {/* A Stadium manager holding no position runs the stand rather than
          working one, so they're named here rather than occupying a slot. */}
      {stadiumManagerOffGrid && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-purple-50 border border-purple-100 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-purple-200 text-purple-800">Stadium Mgr</span>
          <span className="text-sm font-semibold text-purple-900">{stadiumManagerOffGrid.name}</span>
          <span className="text-xs text-purple-600">
            On site at the Stadium open to close, every open day. No positions set, so they
            supervise rather than covering one — add a position on Employees to put them in the grid.
          </span>
        </div>
      )}

      {/* Food Village Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 bg-amber-50">
          <span className="text-sm font-bold text-amber-900">Food Village</span>
          <span className="text-xs text-amber-600 ml-2">Hours set per day in Tournament Setup</span>
          {fvUnfilled > 0 && (
            <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
              {fvUnfilled} not filled
            </span>
          )}
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
                const isOptional = !!pos.configurable
                // A position only shows rows for the shifts it actually runs.
                const posSlots = FV_SLOTS.filter(n => runsSlot('food_village', pos.id, n))
                return posSlots.map((slotOrder, slotIdx) => {
                  const isFirstSlot = slotIdx === 0
                  return (
                    <tr key={`${pos.id}-${slotOrder}`} className={`border-t ${isFirstSlot ? 'border-gray-100' : 'border-gray-50'}`}>
                      {isFirstSlot && (
                        <td rowSpan={posSlots.length} className="px-4 py-1 align-middle sticky left-0 bg-white">
                          <div className="text-xs font-semibold text-gray-700">{pos.label}</div>
                          {isOptional && <div className="text-[10px] text-gray-400">optional</div>}
                        </td>
                      )}
                      <td className="px-2 py-1">
                        <span className="text-[10px] text-gray-400 font-semibold">{shiftLabel('food_village', slotOrder)}</span>
                      </td>
                      {currentDates.map(date => {
                        // Check if register 4 is active for this date
                        if (isOptional && !positionActive(pos.id, date)) {
                          return isFirstSlot ? (
                            <td key={date} rowSpan={posSlots.length} className="px-1 py-1 align-middle">
                              <div className="min-h-[140px] rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center">
                                <span className="text-xs text-gray-300">Inactive</span>
                              </div>
                            </td>
                          ) : null
                        }
                        // Held open to close by one person — the later shifts are
                        // covered, not missing, so they must not read as gaps.
                        const holder = fullDayHolder('food_village', date, pos.id)
                        if (holder && holder.slot_order !== slotOrder) {
                          const who = employees.find(e => e.id === holder.employee_id)
                          return (
                            <td key={date} className="px-1 py-1">
                              <div className="min-h-[44px] rounded-lg bg-gray-100 border border-gray-200 flex flex-col items-center justify-center px-1">
                                <span className="text-[10px] text-gray-400 leading-tight">covered</span>
                                {who && (
                                  <span className="text-[9px] text-gray-400 truncate max-w-full">{who.name}</span>
                                )}
                              </div>
                            </td>
                          )
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
          {stadiumUnfilled > 0 && (
            <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
              {stadiumUnfilled} not filled
            </span>
          )}
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
                const posSlots = STADIUM_SLOTS.filter(n => runsSlot('stadium', pos.id, n))
                return posSlots.map((slotOrder, slotIdx) => {
                  const isFirstSlot = slotIdx === 0
                  return (
                    <tr key={`${pos.id}-${slotOrder}`} className={`border-t ${isFirstSlot ? 'border-gray-100' : 'border-gray-50'}`}>
                      {isFirstSlot && (
                        <td rowSpan={posSlots.length} className="px-4 py-1 align-middle sticky left-0 bg-white">
                          <div className="text-xs font-semibold text-gray-700">{pos.label}</div>
                        </td>
                      )}
                      <td className="px-2 py-1">
                        <span className="text-[10px] text-gray-400 font-semibold">{shiftLabel('stadium', slotOrder)}</span>
                      </td>
                      {currentDates.map(date => {
                        if (!isLocationOpen('stadium', date)) {
                          return isFirstSlot ? (
                            <td key={date} rowSpan={posSlots.length} className="px-1 py-1 align-middle">
                              <div className="min-h-[92px] rounded-lg bg-gray-50 border border-dashed border-gray-100 flex items-center justify-center">
                                <span className="text-xs text-gray-200">CLOSED</span>
                              </div>
                            </td>
                          ) : null
                        }
                        // Held open to close by one person — the later shifts are
                        // covered, not missing, so they must not read as gaps.
                        const holder = fullDayHolder('stadium', date, pos.id)
                        if (holder && holder.slot_order !== slotOrder) {
                          const who = employees.find(e => e.id === holder.employee_id)
                          return (
                            <td key={date} className="px-1 py-1">
                              <div className="min-h-[44px] rounded-lg bg-gray-100 border border-gray-200 flex flex-col items-center justify-center px-1">
                                <span className="text-[10px] text-gray-400 leading-tight">covered</span>
                                {who && (
                                  <span className="text-[9px] text-gray-400 truncate max-w-full">{who.name}</span>
                                )}
                              </div>
                            </td>
                          )
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

      {/* Who got what, and what stopped them getting more. */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <button
          onClick={() => setShowSummary(v => !v)}
          className="w-full px-5 py-3 min-h-[44px] flex items-center justify-between text-left bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition"
        >
          <span>
            <span className="text-sm font-bold text-slate-900">Who&apos;s working — {PERIOD_LABELS[activePeriod]}</span>
            <span className="text-xs text-slate-500 ml-2">
              Grouped by station, fewest days first. Tap anyone for their week day by day
            </span>
          </span>
          <span className="text-xs font-semibold text-slate-500">{showSummary ? 'Hide' : 'Show'}</span>
        </button>

        {showSummary && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  <th className="px-4 py-2 text-left font-semibold text-gray-500">Name</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-500">Days</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-500">Hours</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-500">Free days</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-500">Can work</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-500">Why</th>
                </tr>
              </thead>
              <tbody>
                {stations.map(station => (
                  <Fragment key={station.id}>
                  <tr className="bg-slate-100/80 border-y border-slate-200">
                    <td colSpan={6} className="px-4 py-1.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{station.label}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {station.people.length} can cover it
                        {(() => {
                          const spare = station.people.filter(r => r.days < r.freeDays).length
                          return spare > 0 ? ` · ${spare} with free days going unused` : ' · all fully used'
                        })()}
                      </span>
                    </td>
                  </tr>
                  {station.people.map(({ e, days, hours, freeDays, cap, worksFull, promised, reason, tone }) => {
                  const rowKey = `${station.id}:${e.id}`
                  return (
                  <Fragment key={rowKey}>
                  <tr
                    onClick={() => setOpenPerson(openPerson === rowKey ? null : rowKey)}
                    className="border-b border-gray-50 cursor-pointer hover:bg-slate-50 active:bg-slate-100"
                  >
                    <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">
                      <span className="text-gray-300 mr-1.5">{openPerson === rowKey ? '▾' : '▸'}</span>
                      {e.name}
                      {e.is_manager && (
                        <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Mgr</span>
                      )}
                      {worksFull && (
                        <span className="ml-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">Full day</span>
                      )}
                      {promised != null && (
                        <span className="ml-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          Deal {promised}
                        </span>
                      )}
                      {cap != null && (
                        <span className="ml-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Max {cap}</span>
                      )}
                    </td>
                    <td className={`px-3 py-2.5 text-center font-bold tabular-nums ${days === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {days}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-gray-600">
                      {hours > 0 ? Math.round(hours) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-gray-400">{freeDays}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {(e.skills ?? []).map(skillLabel).join(', ') || <span className="text-red-500">No skills set</span>}
                      {(e.locations ?? []).length === 1 && (
                        <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {LOCATION_LABELS[e.locations![0] as Location]} only
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-xs ${
                      tone === 'stop' ? 'text-red-600 font-semibold'
                      : tone === 'warn' ? 'text-amber-700'
                      : 'text-gray-400'
                    }`}>
                      {reason || 'Every free day used'}
                    </td>
                  </tr>
                  {openPerson === rowKey && (
                    <tr className="border-b border-gray-100 bg-slate-50/60">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                          {currentDates.map(date => {
                            const { weekday, date: d, month } = formatDateHeader(date)
                            const detail = dayDetail(e, date)
                            return (
                              <div key={date} className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                                detail.tone === 'on' ? 'bg-white border-emerald-200'
                                : detail.tone === 'gap' ? 'bg-white border-amber-200'
                                : 'bg-transparent border-gray-100'
                              }`}>
                                <div className="font-semibold text-gray-700">{weekday} {month} {d}</div>
                                <div className={
                                  detail.tone === 'on' ? 'text-emerald-700'
                                  : detail.tone === 'gap' ? 'text-amber-700'
                                  : 'text-gray-400'
                                }>
                                  {detail.text}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  )})}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">
              Anyone qualified for several stations is listed under each, so the spare capacity
              for one is often standing in another — that&apos;s who to move. The <strong>Can work</strong>
              column shows where else they can go.
              <br />
              Auto-Schedule balances <strong>hours</strong>, not days — so someone on full days
              reaches everyone else&apos;s total in fewer, longer days. It is also deterministic:
              running it again always produces the same schedule.
            </p>
          </div>
        )}
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
