import type { DayShift, Employee, Location, Position, ShiftPeriod } from './types'
import { shiftPeriodFor, shiftLengthHours } from './types'

/**
 * Scheduling policy — the decisions about ORDER that keep being subtly wrong,
 * kept here as pure functions so they can be exercised directly rather than
 * through a server action that needs a database.
 */

/**
 * Operational priority. A stand has to open and it has to close, so AM and PM
 * are the shifts that must be covered. MID is the overlap that helps at peak
 * and is the right thing to lose when staff runs short — it fills in as one of
 * the AM crew leaves, rather than being staffed ahead of them.
 */
export const SHIFT_PRIORITY: ShiftPeriod[] = ['am', 'pm', 'mid']

export function shiftPriorityIndex(location: Location, slotOrder: number): number {
  const i = SHIFT_PRIORITY.indexOf(shiftPeriodFor(location, slotOrder))
  return i === -1 ? SHIFT_PRIORITY.length : i
}


/**
 * Slots in the order they should be filled: hardest to staff first, without
 * breaking operational priority.
 *
 * Coverage still comes first — every position's opening shift before anyone's
 * handoff — so this only reorders WITHIN a shift period. Inside one, a slot
 * two people can work is filled before a slot eight people can work, so the
 * scarce slot gets one of its few takers rather than finding them all used up.
 */
export function orderByScarcity(
  slots: DaySlot[],
  candidateCount: (slot: DaySlot) => number
): DaySlot[] {
  return slots
    .map((slot, i) => ({ slot, i, count: candidateCount(slot) }))
    .sort((a, b) => {
      const pa = shiftPriorityIndex(a.slot.location, a.slot.slotOrder)
      const pb = shiftPriorityIndex(b.slot.location, b.slot.slotOrder)
      if (pa !== pb) return pa - pb
      if (a.count !== b.count) return a.count - b.count
      return a.i - b.i // stable: keeps the original position order
    })
    .map(x => x.slot)
}

// ─────────────────────────────────────────────
// Filling one day
// ─────────────────────────────────────────────

/** One shift of one position that needs somebody in it. */
export interface DaySlot {
  location: Location
  position: Position
  isChef: boolean
  slotOrder: number
  start: string
  end: string | null
}

/**
 * Everything filling a day needs to know, with the database already read.
 *
 * The scheduler's hard part is deciding who goes where; the rest is loading
 * rows and writing them back. Keeping the decision behind this interface means
 * fairness can be measured against the real code rather than a stand-in that
 * drifts away from it.
 */
export interface FillDayContext {
  /** Everyone free that day, minus the GM and Stadium manager. */
  staff: Employee[]
  /** Slots to fill, already in coverage order. */
  slots: DaySlot[]
  /** Positions someone may hold open to close, in preference order. */
  fullDayCandidates: { location: Location; position: Position }[]
  /** The shifts a location runs that day, for counting how boxed in someone is. */
  locationShifts: (location: Location) => DayShift[]
  /** A location's opening window, for someone holding a position all day. */
  fullDayWindow: (location: Location) => { start: string; end: string | null }
  availableShifts: (e: Employee) => ShiftPeriod[]
  worksFullDay: (e: Employee) => boolean
  canPosition: (e: Employee, position: Position) => boolean
  canLocation: (e: Employee, location: Location) => boolean
  underCap: (e: Employee) => boolean
  hoursSoFar: (e: Employee) => number
  /** Days still owed this period against an agreed number; 0 if no arrangement. */
  daysOwed: (e: Employee) => number
  /** Fixed at the Stadium for the tournament, placed before anyone else. */
  stadiumManager?: Employee
}

export interface Placement {
  employee: Employee
  location: Location
  position: Position
  slotOrder: number
  start: string
  end: string | null
  isFullDay: boolean
  hours: number
}

export interface DayResult {
  placements: Placement[]
  /** Slots nobody eligible was left for. */
  unfilled: number
}

/**
 * Fill one day.
 *
 * Runs in three stages: the Stadium manager and anyone on full days take whole
 * positions first, then the remaining slots are checked for whether they can be
 * staffed at all, then they are filled.
 */
export function fillDay(ctx: FillDayContext): DayResult {
  const placements: Placement[] = []
  let unfilled = 0

  // One shift per person per day — a handoff needs a second body.
  const assignedToday = new Set<string>()
  // Positions held open to close, whose later shifts need nobody.
  const coveredPositions = new Set<string>()

  function place(
    e: Employee,
    location: Location,
    position: Position,
    slotOrder: number,
    start: string,
    end: string | null,
    isFullDay: boolean
  ) {
    placements.push({
      employee: e, location, position, slotOrder, start, end, isFullDay,
      hours: shiftLengthHours(start, end),
    })
    assignedToday.add(e.id)
    if (isFullDay) coveredPositions.add(`${location}:${position}`)
  }

  /** Hours already worked plus anything placed here, so the sort stays current. */
  function hours(e: Employee): number {
    return (
      ctx.hoursSoFar(e) +
      placements.filter(p => p.employee.id === e.id).reduce((s, p) => s + p.hours, 0)
    )
  }

  function assignFullDay(e: Employee, location: Location, position: Position) {
    const w = ctx.fullDayWindow(location)
    // Recorded against a slot the position actually runs. Hardcoding slot 1
    // hid the assignment for a position that runs only the mid — the Stadium
    // register — because the grid draws no row 1 for it.
    const slot = ctx.slots.find(s => s.location === location && s.position === position)
    place(e, location, position, slot?.slotOrder ?? 1, w.start, w.end, true)
  }

  /**
   * Whether someone is free for every shift the position they'd hold runs.
   *
   * Measured against the POSITION's shifts, not the location's. Prep runs no mid
   * shift, so a prepper marked AM and PM — the correct marking for prep — is
   * free for the whole of prep's day. Checking against the location's three
   * shifts instead asks them to be free for a shift their position never runs,
   * and quietly ignores their full-day arrangement.
   */
  function freeAllDay(e: Employee, location: Location, position: Position): boolean {
    const runs = ctx.slots.filter(s => s.location === location && s.position === position)
    if (runs.length === 0) return false
    const avail = ctx.availableShifts(e)
    return runs.every(s => avail.includes(shiftPeriodFor(location, s.slotOrder)))
  }

  // The Stadium manager is fixed there for the tournament and floats between
  // Register and Prep, so they take a position before anyone else.
  //
  // Only a position they can actually work. This used to fall back to the first
  // Stadium position when none matched, which put a manager given no positions
  // at all onto a till — the one route by which anyone unqualified was ever
  // scheduled, since every other path checks. A manager who works no position
  // runs the Stadium from outside the grid, exactly as the GM does at Food
  // Village, and the schedule names them above it instead.
  const sm = ctx.stadiumManager
  if (sm && ctx.canLocation(sm, 'stadium') && ctx.locationShifts('stadium').length > 0) {
    const target = ctx.fullDayCandidates.find(
      c => c.location === 'stadium' && ctx.canPosition(sm, c.position)
    )
    if (target) assignFullDay(sm, 'stadium', target.position)
  }

  // Then anyone on full days. Each holds a position outright, which is one
  // fewer needing two or three people cycling through it.
  //
  // They are placed every day they are free, and their hours are deliberately
  // NOT balanced against the rest of the crew: working open to close, every
  // open day, is the arrangement they are on. Levelling them down to the crew
  // average is not a fairer schedule, it is the wrong schedule — and it costs
  // coverage, because a full-day holder replaced by a rotation leaves shifts
  // for the rest of the position that there is nobody spare to fill.
  const fullDayStaff = ctx.staff
    .filter(e => ctx.worksFullDay(e) && !assignedToday.has(e.id) && ctx.underCap(e))
    .sort((a, b) => hours(a) - hours(b))

  for (const e of fullDayStaff) {
    const target = ctx.fullDayCandidates.find(
      c =>
        !coveredPositions.has(`${c.location}:${c.position}`) &&
        ctx.canPosition(e, c.position) &&
        ctx.canLocation(e, c.location) &&
        freeAllDay(e, c.location, c.position)
    )
    // No free position they can hold — they drop into the normal rotation
    // below rather than being left off the day.
    if (!target) continue
    assignFullDay(e, target.location, target.position)
  }

  function eligibleFor(e: Employee, slot: DaySlot): boolean {
    return (
      ctx.canPosition(e, slot.position) &&
      ctx.canLocation(e, slot.location) &&
      ctx.availableShifts(e).includes(shiftPeriodFor(slot.location, slot.slotOrder))
    )
  }

  // ── Filling the day ──────────────────────────────────────────────
  //
  // Greedy filling was the problem here. Walking the slots and taking the best
  // person for each never reconsiders a slot once it is taken, so someone who
  // comes later loses every option to colleagues who had alternatives — even
  // when a single swap would seat them both. On a Monday with a prepper on
  // Prep 2 PM who could just as well work the mid, Prep 2 PM stays occupied
  // and the person who could ONLY work Prep 2 PM goes home.
  //
  // That swap is an augmenting path, so this matches people to slots properly
  // rather than filling slots one at a time. Each person is tried in turn; if
  // every slot they can work is taken, whoever holds one is asked to move
  // elsewhere, recursively. Nobody is displaced from the day — only shifted to
  // another slot they can work — so a swap never costs a shift, and the result
  // fills as many slots as the crew can possibly cover.
  const openSlots = ctx.slots.filter(
    s => !coveredPositions.has(`${s.location}:${s.position}`)
  )

  const candidates = ctx.staff.filter(e => !assignedToday.has(e.id) && ctx.underCap(e))

  // Scarcest slot first within each shift period, so a slot only two people can
  // work is offered while those two are still free.
  const orderedSlots = orderByScarcity(
    openSlots,
    slot => candidates.filter(e => eligibleFor(e, slot)).length
  )
  const slotIndex = orderedSlots.map((_, i) => i)

  /**
   * Who gets first refusal.
   *
   * Anyone owed days against an agreement, then whoever has worked least.
   * Managers come after equals so they stay free to float rather than taking a
   * slot somebody else needs. Order decides who gets their pick of the slots,
   * not who gets in at all — matching seats everyone who can be seated.
   */
  const byPriority = [...candidates].sort((a, b) => {
    const oa = ctx.daysOwed(a)
    const ob = ctx.daysOwed(b)
    if (oa !== ob) return ob - oa
    const ha = hours(a)
    const hb = hours(b)
    if (ha !== hb) return ha - hb
    if (a.is_manager !== b.is_manager) return a.is_manager ? 1 : -1
    return a.id.localeCompare(b.id) // stable, so the same input gives the same rota
  })

  /** slot index -> who holds it */
  const holder = new Map<number, Employee>()

  /**
   * Seat this person, moving whoever is in the way if they have somewhere else
   * to go. Returns false only when no rearrangement of the whole day can fit
   * them, so a false here really does mean there is no room.
   */
  function seat(e: Employee, allowed: number[], tried: Set<number>): boolean {
    for (const i of allowed) {
      if (tried.has(i) || !eligibleFor(e, orderedSlots[i])) continue
      tried.add(i)
      const current = holder.get(i)
      if (!current || seat(current, allowed, tried)) {
        holder.set(i, e)
        return true
      }
    }
    return false
  }

  // Opens and closes are matched first, on their own, so a short-handed day
  // loses its mids rather than leaving a position with nobody to open it.
  // Widening to the mids afterwards can only add to the matching: nobody
  // already seated is turned out, they are at most moved.
  const openCloseFirst = slotIndex.filter(
    i => shiftPeriodFor(orderedSlots[i].location, orderedSlots[i].slotOrder) !== 'mid'
  )
  for (const phase of [openCloseFirst, slotIndex]) {
    for (const e of byPriority) {
      if ([...holder.values()].some(h => h.id === e.id)) continue
      seat(e, phase, new Set<number>())
    }
  }

  for (const i of slotIndex) {
    const e = holder.get(i)
    const slot = orderedSlots[i]
    if (!e) {
      unfilled++
      continue
    }
    place(e, slot.location, slot.position, slot.slotOrder, slot.start, slot.end, false)
  }

  return { placements, unfilled }
}
