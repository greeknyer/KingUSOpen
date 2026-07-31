/**
 * Measure how evenly Auto-Schedule spreads hours over a week.
 *
 * Runs the REAL fillDay and the REAL shift resolution from lib/, so what this
 * reports is what the app does. Only the per-day loop is restated here, and it
 * is kept deliberately thin — it builds the day's slots and tallies the result,
 * exactly as the server action does, without making any decisions of its own.
 *
 *   node --experimental-strip-types scripts/sim-fairness.ts
 */

import {
  FOOD_VILLAGE_POSITIONS,
  STADIUM_POSITIONS,
  shiftsForDay,
  shiftPeriodFor,
  sectionForPosition,
  positionRunsSlotInPeriod,
  positionOpenInPeriod,
  buildPeriodShiftMap,
  positionRunsSlot,
  availableShiftsOn,
  canWorkOn,
  canWorkLocation,
} from '../lib/types.ts'
import type {
  Employee, Location, OperatingHours, Position, Skill, ShiftPeriod, OptionalPositionConfig,
} from '../lib/types.ts'
import { SHIFT_PRIORITY, fillDay } from '../lib/scheduling.ts'
import type { DaySlot } from '../lib/scheduling.ts'

const ALL: ShiftPeriod[] = ['am', 'mid', 'pm']

/** A weekly pattern with the same shifts every day. */
function every(shifts: ShiftPeriod[]) {
  return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), shifts]))
}

/** Weekdays one way, weekend another. */
function split(weekday: ShiftPeriod[], weekend: ShiftPeriod[]) {
  return Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map(d => [String(d), d >= 5 ? weekend : weekday])
  )
}

let n = 0
function emp(
  name: string,
  skills: Skill[],
  pattern: Record<string, ShiftPeriod[]>,
  extra: Partial<Employee> = {}
): Employee {
  return {
    id: `e${++n}`,
    name,
    email: null,
    phone: null,
    is_manager: false,
    skills,
    locations: ['food_village', 'stadium'],
    weekly_availability: pattern,
    max_shifts_per_week: null,
    min_shifts_per_week: null,
    works_full_day: false,
    active: true,
    created_at: '',
    ...extra,
  }
}

// A crew shaped like the real one: mostly open, a few tied to one shift, a
// couple of full-day preppers, one chef, one salads cover.
const staff: Employee[] = [
  emp('Register A', ['register'], every(ALL)),
  emp('Register B', ['register'], every(ALL), process.env.DEALS === '1' ? { min_shifts_per_week: 6 } : {}),
  emp('Register C', ['register'], every(ALL)),
  emp('Register D', ['register'], every(['am'])),
  emp('Register E', ['register'], every(['pm'])),
  emp('Register F', ['register'], split(['pm'], ALL)),
  emp('Register G', ['register'], every(ALL)),
  emp('Register H', ['register'], every(['mid', 'pm'])),
  emp('Prep A', ['prep'], every(ALL), { works_full_day: true }),
  emp('Prep B', ['prep'], every(['am', 'pm']), { works_full_day: true }),
  emp('Prep C', ['prep'], every(ALL)),
  emp('Prep D', ['prep'], every(['pm'])),
  emp('Prep E', ['prep'], split(['pm'], ALL)),
  emp('Prep F', ['prep', 'register'], every(ALL)),
  // The chef is in for the morning only, and not every day — his hours come
  // from his pattern, not from being the only person who can cook.
  emp('Alberto', ['chef'], { '0': ['am'], '1': ['am'], '2': ['am'], '3': ['am'], '4': ['am'], '5': [], '6': ['am'] }),
  emp('Salads A', process.env.CHEF2 === '1' ? ['salads','chef'] : ['salads'], every(ALL)),
  emp('Salads B', process.env.CHEFMGR === '1' ? ['salads','prep','chef'] : ['salads','prep'], every(ALL), process.env.CHEFMGR === '1' ? { is_manager: true } : {}),
  emp('Stadium A', ['register'], every(ALL), { locations: ['stadium'] }),
  emp('Stadium B', ['register', 'prep'], every(ALL), { locations: ['stadium'] }),
  emp('Stadium C', ['prep'], every(ALL), process.env.DEALS === '1' ? { locations: ['stadium'], min_shifts_per_week: 6 } : { locations: ['stadium'] }),
]

const SHORT = process.env.SHORT === '1'
const DATES = ['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-29','2026-08-30']
const PERIOD = 1 // Week 1

function hoursRow(location: Location, open: string, close: string): OperatingHours {
  return {
    id: '', year: 2026, location, period: PERIOD, day_index: 0,
    is_open: true, open_time: open, close_time: close,
  } as OperatingHours
}
const FV_HOURS = hoursRow('food_village', '10:00', '23:00')
const ST_HOURS = hoursRow('stadium', '10:00', '23:00')

// Week 1 as migration 015 seeds it: R3 is the midday till, R4 shut.
const configs: OptionalPositionConfig[] = [
  { year: 2026, period: PERIOD, position: 'register_1', is_active: true, shifts: ['am', 'pm'] },
  { year: 2026, period: PERIOD, position: 'register_2', is_active: true, shifts: ['am', 'pm'] },
  { year: 2026, period: PERIOD, position: 'register_3', is_active: true, shifts: ['mid'] },
  { year: 2026, period: PERIOD, position: 'register_4', is_active: false, shifts: [] },
  { year: 2026, period: PERIOD, position: 'prep_4', is_active: process.env.PREP4 === '1',
    shifts: process.env.PREP4 === '1' ? ['am','pm'] : [] },
] as OptionalPositionConfig[]
const periodShiftMap = buildPeriodShiftMap(configs)

function shiftsFor(location: Location, section: string | null = null, position: Position | null = null) {
  return shiftsForDay(location, location === 'food_village' ? FV_HOURS : ST_HOURS, [], section, position)
}

const GAPS = new Map<string, number>()
let AMPM_TOTAL=0, AMPM_FILLED=0, MID_TOTAL=0, MID_FILLED=0
export function runWeek() {
  const hoursTally = new Map<string, number>(staff.map(e => [e.id, 0]))
  const dayCount = new Map<string, number>(staff.map(e => [e.id, 0]))
  let unfilled = 0

  for (const date of DATES) {
    const fvShifts = shiftsFor('food_village')
    const stadiumShifts = shiftsFor('stadium')
    const fvPositions = FOOD_VILLAGE_POSITIONS.filter(p =>
      positionOpenInPeriod(periodShiftMap, p.id, PERIOD)
    )

    const slots: DaySlot[] = []
    for (const shiftPeriod of SHIFT_PRIORITY) {
      for (const pos of fvPositions) {
        const posShifts = shiftsFor('food_village', sectionForPosition(pos.id), pos.id)
        const fv = posShifts.find(s => shiftPeriodFor('food_village', s.slot_order) === shiftPeriod)
        if (!fv) continue
        if (!positionRunsSlotInPeriod(periodShiftMap, 'food_village', pos.id, fv.slot_order, PERIOD)) continue
        slots.push({
          location: 'food_village', position: pos.id, isChef: pos.id === 'chef',
          slotOrder: fv.slot_order, start: fv.start, end: fv.end,
        })
      }
      const st = stadiumShifts.find(s => shiftPeriodFor('stadium', s.slot_order) === shiftPeriod)
      if (st) {
        for (const pos of STADIUM_POSITIONS) {
          if (!positionRunsSlot('stadium', pos.id, st.slot_order)) continue
          slots.push({
            location: 'stadium', position: pos.id, isChef: false,
            slotOrder: st.slot_order, start: st.start, end: st.end,
          })
        }
      }
    }

    const available = staff
      .filter(e => availableShiftsOn(e, date).length > 0)
      .slice(0, SHORT ? 9 : undefined)

    const { placements, unfilled: dayUnfilled } = fillDay({
      staff: available,
      slots,
      fullDayCandidates: [
        ...fvPositions.map(p => ({ location: 'food_village' as Location, position: p.id })),
        ...STADIUM_POSITIONS.map(p => ({ location: 'stadium' as Location, position: p.id })),
      ],
      locationShifts: loc => (loc === 'food_village' ? fvShifts : stadiumShifts),
      fullDayWindow: loc => {
        const h = loc === 'food_village' ? FV_HOURS : ST_HOURS
        return { start: h.open_time!, end: h.close_time }
      },
      availableShifts: e => availableShiftsOn(e, date),
      worksFullDay: e => e.works_full_day,
      canPosition: (e, position) => canWorkOn(e, position),
      canLocation: canWorkLocation,
      underCap: () => true,
      hoursSoFar: e => hoursTally.get(e.id) ?? 0,
      daysOwed: e => e.min_shifts_per_week == null ? 0 : Math.max(0, e.min_shifts_per_week - (dayCount.get(e.id) ?? 0)),
    })

    for (const s2 of slots) {
      const per = shiftPeriodFor(s2.location, s2.slotOrder)
      if (per === 'mid') MID_TOTAL++; else AMPM_TOTAL++
    }
    for (const p of placements) {
      if (p.isFullDay) continue
      const per = shiftPeriodFor(p.location, p.slotOrder)
      if (per === 'mid') MID_FILLED++; else AMPM_FILLED++
    }
    // Which positions actually went uncovered, to name the gaps rather than count them.
    for (const s3 of slots) {
      const held = placements.some(p => p.isFullDay && p.location === s3.location && p.position === s3.position)
      const filled = placements.some(p => !p.isFullDay && p.location === s3.location && p.position === s3.position && p.slotOrder === s3.slotOrder)
      if (!held && !filled) {
        const k = `${s3.position} ${shiftPeriodFor(s3.location, s3.slotOrder).toUpperCase()}`
        GAPS.set(k, (GAPS.get(k) ?? 0) + 1)
      }
    }
    unfilled += dayUnfilled
    for (const p of placements) {
      hoursTally.set(p.employee.id, (hoursTally.get(p.employee.id) ?? 0) + p.hours)
      dayCount.set(p.employee.id, (dayCount.get(p.employee.id) ?? 0) + 1)
    }
  }

  return { hoursTally, dayCount, unfilled }
}

const { hoursTally, dayCount, unfilled } = runWeek()

const rows = staff
  .map(e => ({ name: e.name, hours: hoursTally.get(e.id) ?? 0, days: dayCount.get(e.id) ?? 0 }))
  .sort((a, b) => b.hours - a.hours)

console.log('name           days   hours')
for (const r of rows) {
  console.log(`${r.name.padEnd(14)} ${String(r.days).padStart(4)} ${r.hours.toFixed(1).padStart(7)}`)
}

// Full-day staff and the only person holding a skill are meant to be outliers:
// working open to close every day, or being the sole chef, is the arrangement.
// Fairness is about the people who rotate through shifts, so they're measured
// on their own rather than being averaged in with staff on a fixed deal.
const fixedDeal = new Set(
  staff
    .filter(e => e.works_full_day || e.skills.some(s => staff.filter(o => o.skills.includes(s)).length <= 2))
    .map(e => e.name)
)
const rotation = rows.filter(r => r.days > 0 && !fixedDeal.has(r.name)).map(r => r.hours)
console.log(
  `\nrotation staff: ${rotation.length} people   ` +
  `${Math.min(...rotation).toFixed(1)}–${Math.max(...rotation).toFixed(1)}h   ` +
  `spread ${(Math.max(...rotation) - Math.min(...rotation)).toFixed(1)}`
)

const worked = rows.filter(r => r.days > 0).map(r => r.hours)
const max = Math.max(...worked)
const min = Math.min(...worked)
const mean = worked.reduce((s, h) => s + h, 0) / worked.length
console.log(`\nmax ${max.toFixed(1)}   min ${min.toFixed(1)}   spread ${(max - min).toFixed(1)}   mean ${mean.toFixed(1)}`)
const mids = MID_FILLED
console.log(`AM/PM filled: ${AMPM_FILLED}/${AMPM_TOTAL}   MID filled: ${mids}/${MID_TOTAL}`)
console.log('\nuncovered slots by position:')
for (const [k,v] of [...GAPS].sort((a,b)=>b[1]-a[1])) console.log(`  ${k.padEnd(22)} ${v}`)
console.log(`never scheduled: ${rows.filter(r => r.days === 0).length}   unfilled slots: ${unfilled}`)
