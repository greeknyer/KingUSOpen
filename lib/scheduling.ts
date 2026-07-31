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

export interface PickContext {
  /** How many of the day's shifts this person could take at all. */
  shiftOptions: (e: Employee) => number
  /** Hours already assigned to them this period. */
  hours: (e: Employee) => number
  /** Days still owed against an agreed number; 0 for everyone else. */
  owed: (e: Employee) => number
}

/**
 * Who should fill a slot, best first.
 *
 * Anyone still owed days against an agreed number comes first, most owed first.
 * Some staff return every year on a deal for a set number of days, and a deal
 * is precisely not an even share — so it is settled before the even share is
 * worked out. Once someone reaches their number their debt is zero and they
 * join everyone else, ranked on hours like anybody without an arrangement.
 *
 * After that: whoever has worked least.
 *
 * This used to sort by how boxed in someone was BEFORE looking at hours, to
 * stop a flexible colleague taking the only slot a PM-only person could work.
 * As a rule over people it never rebalanced: an open employee lost every slot
 * to a constrained one all week, so the most flexible staff ended up with the
 * least work — 23 hours against 49 in a simulated week.
 *
 * Scarcity is a property of the SLOT, not of the person, and it is handled as
 * one in `orderByScarcity` — the slot with fewest takers is filled while those
 * takers are still free. That protects the PM-only person's slot without
 * granting them standing priority, which leaves hours free to do the balancing.
 *
 * Ties break toward the more constrained person, who has fewer other chances.
 */
export function pickBest(ctx: PickContext) {
  return (a: Employee, b: Employee): number => {
    const oa = ctx.owed(a)
    const ob = ctx.owed(b)
    if (oa !== ob) return ob - oa // most owed first
    const ha = ctx.hours(a)
    const hb = ctx.hours(b)
    if (ha !== hb) return ha - hb
    return ctx.shiftOptions(a) - ctx.shiftOptions(b)
  }
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

/** Mean length of a set of shifts, used to decide long versus short. */
export function meanLength(lengths: number[]): number {
  if (lengths.length === 0) return 0
  return lengths.reduce((sum, n) => sum + n, 0) / lengths.length
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

  /** How many of the day's shifts someone could take at a location. */
  function shiftOptions(e: Employee, location: Location): number {
    const avail = ctx.availableShifts(e)
    return ctx
      .locationShifts(location)
      .filter(s => avail.includes(shiftPeriodFor(location, s.slot_order))).length
  }

  function pickOrder(location: Location) {
    return pickBest({
      shiftOptions: (e: Employee) => shiftOptions(e, location),
      hours,
      // A day already placed here counts against the debt, so two people on
      // deals don't both stay top of the list for the rest of the day.
      owed: (e: Employee) =>
        Math.max(0, ctx.daysOwed(e) - (assignedToday.has(e.id) ? 1 : 0)),
    })
  }

  // Coverage decides WHICH slots get staffed; fairness decides WHO fills them.
  //
  // Pass 1 walks the slots in coverage order — every position's opening shift
  // before anyone's handoff — consuming one eligible person per slot, to work
  // out how many are actually staffable today.
  const openSlots = ctx.slots.filter(
    s => !coveredPositions.has(`${s.location}:${s.position}`)
  )

  // Scarcest slot first within each shift period, so the slot only two people
  // can work is filled before those two have been used up elsewhere.
  const free = ctx.staff.filter(e => !assignedToday.has(e.id) && ctx.underCap(e))
  const ordered = orderByScarcity(
    openSlots,
    slot => free.filter(e => eligibleFor(e, slot)).length
  )

  const unclaimed = new Set(free.map(e => e.id))
  const staffable: DaySlot[] = []
  for (const slot of ordered) {
    // Same choice pass 2 will make, so the two agree about what is coverable.
    const candidate = pickWithoutStranding(
      ctx.staff
        .filter(e => unclaimed.has(e.id) && eligibleFor(e, slot) && ctx.underCap(e))
        .sort(pickOrder(slot.location))
    )
    if (!candidate) continue
    unclaimed.delete(candidate.id)
    staffable.push(slot)
  }

  // Slots pass 1 could not staff at all — nobody eligible left, or everyone who
  // was is already at their weekly cap.
  unfilled += openSlots.length - staffable.length

  // Pass 2 fills them in the same order, so opens and closes are staffed before
  // mids and the two passes agree about what is coverable.
  for (let i = 0; i < staffable.length; i++) {
    const slot = staffable[i]
    const eligible = ctx.staff
      .filter(e => !assignedToday.has(e.id) && eligibleFor(e, slot) && ctx.underCap(e))
      .sort(pickOrder(slot.location))

    // A manager is the fallback everywhere, including the kitchen, so they stay
    // free to float. Chef used to prefer a manager outright, which meant a
    // manager who could cook took the kitchen every day and the actual chef —
    // whose only skill it is — was never scheduled at all.
    const pool = [...eligible.filter(e => !e.is_manager), ...eligible.filter(e => e.is_manager)]

    const emp = pickWithoutStranding(pool)
    if (!emp) {
      unfilled++
      continue
    }
    place(emp, slot.location, slot.position, slot.slotOrder, slot.start, slot.end, false)
  }

  /** Slots anywhere in the day this person could be placed in at all. */
  function placesInDay(e: Employee): number {
    return ctx.slots.filter(
      s => !coveredPositions.has(`${s.location}:${s.position}`) && eligibleFor(e, s)
    ).length
  }

  /**
   * The best candidate for a slot, protecting anyone who has only one place to
   * be in the whole day.
   *
   * Hours decide who works, which is what keeps the registers even. But the
   * chef's only skill is chef, so the kitchen is the single slot he can fill;
   * hand it to whoever happens to be behind on hours and he works nowhere at
   * all. A specialist losing their one slot isn't a fairness trade, it's a
   * person going home.
   *
   * The guard is deliberately limited to exactly that — one place in the day.
   * Someone available only for PM still has every PM slot open to them and is
   * NOT protected here: sorting everyone by how boxed in they are is what left
   * the most available staff with the least work, and slot ordering already
   * fills scarce slots while their few takers are free.
   */
  function pickWithoutStranding(pool: Employee[]): Employee | undefined {
    const best = pool[0]
    if (!best) return undefined
    if (placesInDay(best) <= 1) return best // it's their one place too
    return pool.find(e => placesInDay(e) <= 1) ?? best
  }

  return { placements, unfilled }
}
