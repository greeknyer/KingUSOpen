import type { Employee, Location, ShiftPeriod } from './types'
import { shiftPeriodFor } from './types'

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
  /** Length of the slot being filled. */
  slotLength: number
  /** Mean length of the shifts running that day. */
  meanShiftLength: number
}

/**
 * Who should fill a slot, best first.
 *
 * Two rules, in order.
 *
 * Most constrained first. Someone available only for PM has exactly one way to
 * be used; if a fully flexible colleague takes that PM slot, the PM-only person
 * cannot be placed at all and the slot they could have covered goes empty too.
 *
 * Then, hours — but which direction depends on the shift. Handing the shortest
 * shift to whoever has worked least is self-reinforcing: they stay least-worked
 * and keep getting it, while whoever landed on the long mid keeps that too. So
 * a longer-than-average shift goes to whoever has worked least, and a shorter
 * one to whoever has worked most. That rotates people through the shift types
 * instead of pinning them, and works whatever order the slots are filled in.
 */
export function pickBest(ctx: PickContext) {
  const longShift = ctx.slotLength >= ctx.meanShiftLength
  return (a: Employee, b: Employee): number => {
    const oa = ctx.shiftOptions(a)
    const ob = ctx.shiftOptions(b)
    if (oa !== ob) return oa - ob
    const ha = ctx.hours(a)
    const hb = ctx.hours(b)
    return longShift ? ha - hb : hb - ha
  }
}

/** Mean length of a set of shifts, used to decide long versus short. */
export function meanLength(lengths: number[]): number {
  if (lengths.length === 0) return 0
  return lengths.reduce((sum, n) => sum + n, 0) / lengths.length
}
