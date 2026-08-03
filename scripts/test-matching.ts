/**
 * The Monday case: a prepper on Prep 2 PM who could just as well work another
 * shift, and someone who can ONLY work Prep 2 PM going home instead.
 *
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types scripts/test-matching.ts
 */

import { fillDay } from '../lib/scheduling.ts'
import type { DaySlot } from '../lib/scheduling.ts'
import type { Employee, Location, Position, ShiftPeriod, Skill } from '../lib/types.ts'

let n = 0
function emp(name: string, skills: Skill[], shifts: ShiftPeriod[]): Employee {
  return {
    id: `e${++n}`, name, email: null, phone: null, is_manager: false,
    skills, locations: ['food_village', 'stadium'],
    weekly_availability: {}, max_shifts_per_week: null, min_shifts_per_week: null,
    works_full_day: false, active: true, created_at: '',
    // The scheduler reads availability through the context below, so the
    // shifts each person can work ride along here.
    ...( { _shifts: shifts } as object ),
  } as Employee & { _shifts: ShiftPeriod[] }
}

const shiftsOf = (e: Employee) => (e as Employee & { _shifts: ShiftPeriod[] })._shifts

function slot(position: Position, slotOrder: number, start: string, end: string): DaySlot {
  return { location: 'food_village' as Location, position, isChef: false, slotOrder, start, end }
}

function run(staff: Employee[], slots: DaySlot[], hoursSoFar: Record<string, number> = {}) {
  return fillDay({
    staff,
    slots,
    fullDayCandidates: [],
    locationShifts: () => slots.map(s => ({ slot_order: s.slotOrder, start: s.start, end: s.end })),
    fullDayWindow: () => ({ start: '10:00', end: '23:00' }),
    availableShifts: shiftsOf,
    worksFullDay: () => false,
    canPosition: (e, position) =>
      e.skills.includes(position.startsWith('prep') ? 'prep' : 'register'),
    canLocation: () => true,
    underCap: () => true,
    hoursSoFar: e => hoursSoFar[e.name] ?? 0,
    daysOwed: () => 0,
  })
}

let failures = 0
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) { console.log(`      ${detail}`); failures++ }
}

// ── The Monday case ───────────────────────────────────────────────
//
// Prep 2 PM and a midday till. Flex works either; Dimos works only prep PM.
//
// Opens and closes are matched before mids, so Flex — having worked less — is
// put on Prep 2 PM first. Filling greedily from there, Dimos has nowhere left,
// the midday till goes to nobody who can work it, and the day ends a person
// short with a slot empty. Flex moving to the mid seats them both.
{
  const flex = emp('Flex', ['prep', 'register'], ['am', 'mid', 'pm'])
  const dimos = emp('Dimos', ['prep'], ['pm'])
  const slots = [
    slot('prep_2', 3, '16:00', '23:00'),
    slot('register_4', 2, '12:00', '20:00'),
  ]
  const { placements, unfilled } = run([flex, dimos], slots, { Flex: 0, Dimos: 40 })

  const names = placements.map(p => `${p.employee.name}@${p.position}`).sort()
  check(
    'both are placed, so neither slot is left empty',
    placements.length === 2 && unfilled === 0,
    `got ${placements.length} placements, ${unfilled} unfilled: ${names.join(', ')}`
  )
  check(
    'Dimos takes the Prep 2 PM he is the only candidate for',
    placements.some(p => p.employee.name === 'Dimos' && p.position === 'prep_2'),
    `got ${names.join(', ')}`
  )
  check(
    'Flex is moved to the mid rather than dropped from the day',
    placements.some(p => p.employee.name === 'Flex' && p.position === 'register_4'),
    `got ${names.join(', ')}`
  )
}

// ── A chain of moves, not just one ────────────────────────────────
//
// Three people each boxed into a different slot, and one flexible colleague
// sitting in the middle of the chain. Seating everybody needs more than a
// single swap.
{
  const a = emp('OpenA', ['prep'], ['am', 'mid', 'pm'])
  const b = emp('OpenB', ['prep'], ['am', 'mid', 'pm'])
  const pmOnly = emp('PmOnly', ['prep'], ['pm'])
  const amOnly = emp('AmOnly', ['prep'], ['am'])
  const slots = [
    slot('prep_1', 1, '10:00', '16:00'),
    slot('prep_1', 3, '16:00', '23:00'),
    slot('prep_2', 1, '10:00', '16:00'),
    slot('prep_2', 3, '16:00', '23:00'),
  ]
  const { placements, unfilled } = run([a, b, pmOnly, amOnly], slots,
    { OpenA: 0, OpenB: 0, PmOnly: 50, AmOnly: 50 })

  check(
    'all four slots are filled and nobody is sent home',
    placements.length === 4 && unfilled === 0,
    `got ${placements.length} placements, ${unfilled} unfilled: ` +
      placements.map(p => `${p.employee.name}@${p.slotOrder}`).join(', ')
  )
}

// ── Genuinely impossible stays impossible ─────────────────────────
//
// Matching must not invent coverage: two PM-only people cannot cover an AM.
{
  const p1 = emp('Pm1', ['prep'], ['pm'])
  const p2 = emp('Pm2', ['prep'], ['pm'])
  const slots = [slot('prep_1', 1, '10:00', '16:00'), slot('prep_1', 3, '16:00', '23:00')]
  const { placements, unfilled } = run([p1, p2], slots)

  check(
    'the AM nobody can work is reported unfilled',
    placements.length === 1 && unfilled === 1,
    `got ${placements.length} placements, ${unfilled} unfilled`
  )
  check(
    'one person per slot per day is still respected',
    new Set(placements.map(p => p.employee.id)).size === placements.length,
    'someone was placed twice'
  )
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1
