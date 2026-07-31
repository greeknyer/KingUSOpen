/** The distinct jobs someone can be qualified for. */
export type Skill = 'register' | 'prep' | 'chef' | 'salads'

export const SKILLS: { id: Skill; label: string }[] = [
  { id: 'register', label: 'Register' },
  { id: 'prep', label: 'Prep' },
  { id: 'chef', label: 'Chef' },
  { id: 'salads', label: 'Salads' },
]

export interface Employee {
  id: string
  name: string
  email: string | null
  phone: string | null
  is_manager: boolean
  skills: Skill[]
  locations: Location[]                        // where they can work
  weekly_availability: WeeklyAvailability      // which shifts, per day of week
  max_shifts_per_week: number | null           // cap per period; null = no cap
  /** Works a position open to close instead of a shift; covers it alone. */
  works_full_day: boolean
  active: boolean
  created_at: string
}

/** The three shifts, named as the crew refer to them. */
export type ShiftPeriod = 'am' | 'mid' | 'pm'

export const SHIFT_PERIODS: { id: ShiftPeriod; label: string }[] = [
  { id: 'am', label: 'AM' },
  { id: 'mid', label: 'MID' },
  { id: 'pm', label: 'PM' },
]

/**
 * Which named shift a slot represents. Food Village runs all three; the Stadium
 * runs at most two, so its second slot is the PM shift rather than the mid.
 */
export function shiftPeriodFor(location: Location, slotOrder: number): ShiftPeriod {
  if (location === 'stadium') return slotOrder === 1 ? 'am' : 'pm'
  return slotOrder === 1 ? 'am' : slotOrder === 2 ? 'mid' : 'pm'
}

export function shiftLabel(location: Location, slotOrder: number): string {
  const period = shiftPeriodFor(location, slotOrder)
  return SHIFT_PERIODS.find(s => s.id === period)?.label ?? String(slotOrder)
}

/** Shifts workable on each weekday, keyed '0' = Monday through '6' = Sunday. */
export type WeeklyAvailability = Record<string, ShiftPeriod[]>

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Monday-based weekday index for a YYYY-MM-DD date, matching DAY_LABELS. */
export function weekdayIndex(date: string): number {
  const d = new Date(date + 'T00:00:00')
  return (d.getDay() + 6) % 7
}

export const OPEN_AVAILABILITY: WeeklyAvailability = {
  '0': ['am', 'mid', 'pm'], '1': ['am', 'mid', 'pm'], '2': ['am', 'mid', 'pm'],
  '3': ['am', 'mid', 'pm'], '4': ['am', 'mid', 'pm'], '5': ['am', 'mid', 'pm'],
  '6': ['am', 'mid', 'pm'],
}

export const WEEKDAYS_ONLY_AVAILABILITY: WeeklyAvailability = {
  '0': ['am', 'mid', 'pm'], '1': ['am', 'mid', 'pm'], '2': ['am', 'mid', 'pm'],
  '3': ['am', 'mid', 'pm'], '4': ['am', 'mid', 'pm'], '5': [], '6': [],
}

/** True when someone can work every shift on every day. */
export function isOpenAvailability(w: WeeklyAvailability | null | undefined): boolean {
  if (!w) return true
  return DAY_LABELS.every((_, i) => (w[String(i)] ?? []).length === SHIFT_PERIODS.length)
}

export interface TournamentSettings {
  id: string
  year: number
  start_date: string          // First Monday of Week 1 (YYYY-MM-DD)
  pre_tournament_days: number // Days before week 1 (default 3)
  // Fixed for the whole tournament, one per location.
  general_manager_id: string | null  // runs Food Village, sits outside the grid
  stadium_manager_id: string | null  // the Stadium's manager, floats Register/Prep
}

export interface OperatingHours {
  id: string
  year: number
  location: Location
  period: number       // 0=pre-tournament, 1=week1, 2=week2, 3=week3
  day_index: number    // 0-6, index within that period
  is_open: boolean
  open_time: string | null    // HH:MM
  close_time: string | null   // HH:MM, or null = open-ended ("Close")
}

// Used to seed the Setup grid. These are the times that were previously
// hardcoded in the auto-scheduler — set the real ones in Tournament Setup.
export const DEFAULT_HOURS: Record<Location, { open: string; close: string }> = {
  food_village: { open: '10:00', close: '16:00' },
  stadium: { open: '10:30', close: '16:00' },
}

export interface ShiftTemplate {
  id: string
  year: number
  location: Location
  slot_order: number         // 1, 2 or 3
  start_time: string         // HH:MM
  end_time: string | null    // HH:MM, or null = runs to that day's close
}

/**
 * The Food Village's three overlapping shifts. #1 hands off to #3 at 4pm while
 * #2 straddles both, putting two people on each position from noon through the
 * afternoon-into-evening peak — enough to staff all four registers.
 */
export const DEFAULT_SHIFT_TEMPLATES: Record<
  Location,
  { slot_order: number; start_time: string; end_time: string | null }[]
> = {
  food_village: [
    { slot_order: 1, start_time: '10:00', end_time: '16:00' },
    { slot_order: 2, start_time: '12:00', end_time: null },
    { slot_order: 3, start_time: '16:00', end_time: null },
  ],
  // The Stadium derives its shifts from each day's hours instead — see
  // shiftsForDay below — so it has no templates.
  stadium: [],
}

/** How many slot rows each location's grid shows. */
export const SLOTS_PER_LOCATION: Record<Location, number> = {
  food_village: 3,
  stadium: 2,
}

/** A position that runs some periods and not others. */
export interface OptionalPositionConfig {
  id: string
  year: number
  period: number   // 0=pre, 1=week1, 2=week2, 3=week3
  position: Position
  is_active: boolean
}

export interface Availability {
  id: string
  employee_id: string
  date: string
  available: boolean
  /** Which shifts on this date. [] = off. null = whatever the pattern allows. */
  shifts: ShiftPeriod[] | null
  /** Overrides the employee's works_full_day for this date. null = inherit. */
  full_day: boolean | null
  /** Narrows which skills they cover this date. null = any they hold. */
  positions: Skill[] | null
  notes: string | null
}

export type Position =
  | 'register_1' | 'register_2' | 'register_3' | 'register_4'
  | 'prep_1' | 'prep_2' | 'prep_3' | 'prep_4'
  | 'chef' | 'salads'
  | 'stadium_register' | 'stadium_prep'

export type Location = 'food_village' | 'stadium'

export interface ScheduleAssignment {
  id: string
  year: number
  date: string
  location: Location
  position: Position
  slot_order: number      // 1 or 2 (handoff)
  employee_id: string | null
  planned_start: string | null   // HH:MM
  planned_end: string | null     // HH:MM or null = 'close'
  /** Holds this position open to close, so its later shifts need nobody. */
  is_full_day: boolean
  status: 'draft' | 'published'
  employee?: Employee
}

export interface TimeEntry {
  id: string
  year: number
  employee_id: string
  date: string
  actual_in: string | null    // HH:MM
  actual_out: string | null   // HH:MM
  hours_calculated: number | null
  notes: string | null
  employee?: Employee
}

// Position metadata. `shifts` narrows which of the location's shifts a position
// actually runs — omitted means all of them.
type PositionMeta = {
  id: Position
  label: string
  section?: string
  configurable?: boolean
  shifts?: ShiftPeriod[]
}

export const FOOD_VILLAGE_POSITIONS: PositionMeta[] = [
  { id: 'register_1', label: 'Register 1', section: 'Registers' },
  { id: 'register_2', label: 'Register 2', section: 'Registers' },
  { id: 'register_3', label: 'Register 3', section: 'Registers' },
  { id: 'register_4', label: 'Register 4', section: 'Registers', configurable: true },
  // Prep runs open and close only, no mid: an AM prepper hands to a PM one.
  { id: 'prep_1', label: 'Prep 1', section: 'Prep', shifts: ['am', 'pm'] },
  { id: 'prep_2', label: 'Prep 2', section: 'Prep', shifts: ['am', 'pm'] },
  { id: 'prep_3', label: 'Prep 3', section: 'Prep', shifts: ['am', 'pm'] },
  // Off for Week 1, on later — switched per period like Register 4.
  { id: 'prep_4', label: 'Prep 4', section: 'Prep', shifts: ['am', 'pm'], configurable: true },
  // The kitchen runs no mid shift — both its positions are open and close only.
  { id: 'chef', label: 'Chef', section: 'Kitchen', shifts: ['am', 'pm'] },
  { id: 'salads', label: 'Salads', section: 'Kitchen', shifts: ['am', 'pm'] },
]

export const STADIUM_POSITIONS: PositionMeta[] = [
  { id: 'stadium_register', label: 'Register' },
  { id: 'stadium_prep', label: 'Prep' },
]

const ALL_POSITIONS: PositionMeta[] = [...FOOD_VILLAGE_POSITIONS, ...STADIUM_POSITIONS]

/** Positions switched on and off per period in Tournament Setup. */
export const OPTIONAL_POSITIONS: PositionMeta[] = ALL_POSITIONS.filter(p => p.configurable)

/** Which shifts a position runs. Defaults to every shift its location has. */
export function positionShifts(position: Position): ShiftPeriod[] {
  return ALL_POSITIONS.find(p => p.id === position)?.shifts ?? SHIFT_PERIODS.map(s => s.id)
}

/** Whether a position runs the shift a given slot number represents. */
export function positionRunsSlot(
  location: Location,
  position: Position,
  slotOrder: number
): boolean {
  return positionShifts(position).includes(shiftPeriodFor(location, slotOrder))
}

/** Which skill a position requires. Both locations draw on the same skills. */
export const POSITION_SKILL: Record<Position, Skill> = {
  register_1: 'register',
  register_2: 'register',
  register_3: 'register',
  register_4: 'register',
  prep_1: 'prep',
  prep_2: 'prep',
  prep_3: 'prep',
  prep_4: 'prep',
  chef: 'chef',
  salads: 'salads',
  stadium_register: 'register',
  stadium_prep: 'prep',
}

/** Whether an employee is qualified to work a position. */
export function canWork(employee: Employee, position: Position): boolean {
  return (employee.skills ?? []).includes(POSITION_SKILL[position])
}

/**
 * The skills someone actually covers on a date. Their qualifications unless the
 * date narrows them — the salads cover on a Monday shouldn't be pulled onto
 * prep. Intersected with their skills so an override can only ever narrow.
 */
export function coveredSkillsOn(
  employee: Employee,
  override?: Availability
): Skill[] {
  const held = employee.skills ?? []
  if (!override?.positions) return held
  return held.filter(s => override.positions!.includes(s))
}

/** Whether they're qualified for a position AND covering it on that date. */
export function canWorkOn(
  employee: Employee,
  position: Position,
  override?: Availability
): boolean {
  return coveredSkillsOn(employee, override).includes(POSITION_SKILL[position])
}

/**
 * Whether an employee can work a location. Treated as unrestricted when unset
 * so a row written before locations existed stays schedulable.
 */
export function canWorkLocation(employee: Employee, location: Location): boolean {
  const locs = employee.locations ?? []
  return locs.length === 0 || locs.includes(location)
}

/**
 * Whether an employee works this shift on this date's weekday. A missing
 * pattern reads as unrestricted so a row written before the column existed
 * stays schedulable rather than dropping out of every schedule.
 */
export function canWorkShiftOn(
  employee: Employee,
  date: string,
  location: Location,
  slotOrder: number
): boolean {
  const pattern = employee.weekly_availability
  if (!pattern) return true
  const day = pattern[String(weekdayIndex(date))]
  if (day === undefined) return true
  return day.includes(shiftPeriodFor(location, slotOrder))
}

/** The shifts an employee's standing pattern allows on a date's weekday. */
export function patternShiftsOn(employee: Employee, date: string): ShiftPeriod[] {
  const pattern = employee.weekly_availability
  const all = SHIFT_PERIODS.map(s => s.id)
  if (!pattern) return all
  return pattern[String(weekdayIndex(date))] ?? all
}

/** Whether the standing pattern has them working at all on this date. */
export function patternAvailableOn(employee: Employee, date: string): boolean {
  return patternShiftsOn(employee, date).length > 0
}

/**
 * Whether someone works open to close on a date. Their standing arrangement
 * unless the date's override says otherwise — a full-day prepper may only
 * manage a shift on one day, and a shift worker may cover a full day when the
 * stand is short-handed.
 */
export function worksFullDayOn(
  employee: Employee,
  date: string,
  override?: Availability
): boolean {
  if (override && override.full_day != null) return override.full_day
  return employee.works_full_day ?? false
}

/**
 * The shifts an employee can actually work on a date: their standing weekly
 * pattern, unless an override row for that date says otherwise. This is the
 * single answer both the Availability grid and the scheduler read, so the two
 * can't drift apart.
 */
export function availableShiftsOn(
  employee: Employee,
  date: string,
  override?: Availability
): ShiftPeriod[] {
  if (!override) return patternShiftsOn(employee, date)
  // shifts is authoritative when set; otherwise fall back to the boolean.
  if (override.shifts) return override.shifts
  return override.available ? patternShiftsOn(employee, date) : []
}

/** Every standing constraint at once: skill, location, and the weekly pattern. */
export function isEligible(
  employee: Employee,
  position: Position,
  location: Location,
  slotOrder: number,
  date: string
): boolean {
  return (
    canWork(employee, position) &&
    canWorkLocation(employee, location) &&
    canWorkShiftOn(employee, date, location, slotOrder)
  )
}

export const LOCATION_LABELS: Record<Location, string> = {
  food_village: 'Food Village',
  stadium: 'Stadium',
}

export function skillLabel(skill: Skill): string {
  return SKILLS.find(s => s.id === skill)?.label ?? skill
}

// Tournament period utilities
export function getTournamentDates(settings: TournamentSettings): {
  preTournament: string[]
  week1: string[]
  week2: string[]
  week3: string[]
  allDates: string[]
} {
  const weekStart = new Date(settings.start_date + 'T00:00:00')

  // Pre-tournament days end the day before week 1 starts
  const preTournament: string[] = []
  for (let i = settings.pre_tournament_days; i >= 1; i--) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - i)
    preTournament.push(d.toISOString().split('T')[0])
  }

  const week1: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    week1.push(d.toISOString().split('T')[0])
  }

  const week2: string[] = []
  for (let i = 7; i < 14; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    week2.push(d.toISOString().split('T')[0])
  }

  const week3: string[] = []
  for (let i = 14; i < 21; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    week3.push(d.toISOString().split('T')[0])
  }

  return {
    preTournament,
    week1,
    week2,
    week3,
    allDates: [...preTournament, ...week1, ...week2, ...week3],
  }
}

export function getPeriodForDate(date: string, settings: TournamentSettings): number {
  const { preTournament, week1, week2 } = getTournamentDates(settings)
  if (preTournament.includes(date)) return 0
  if (week1.includes(date)) return 1
  if (week2.includes(date)) return 2
  return 3
}

export function formatTime(t: string | null): string {
  if (!t) return 'Close'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, '0')}${ampm}`
}

// ─────────────────────────────────────────────
// Hours of operation
// ─────────────────────────────────────────────

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function fromMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Length of a shift in hours, tolerating a close time past midnight. */
export function shiftLengthHours(start: string | null, end: string | null): number {
  if (!start) return 0
  if (!end) return 6 // open-ended shift — assume 6h for fair-distribution purposes
  const s = toMinutes(start)
  let e = toMinutes(end)
  if (e <= s) e += 1440
  return (e - s) / 60
}

/** A day shorter than this stays a single shift instead of splitting. */
export const HANDOFF_MIN_HOURS = 8

/**
 * Split a day's opening hours into the handoff slots the schedule grid expects.
 *
 * Returns one shift rather than two when the day is short or open-ended — an
 * evening-only day like "Stadium 8/21, 6pm to close" is one shift, not a 6pm
 * handoff to a shift that starts at midnight.
 */
export function planShifts(
  open: string | null,
  close: string | null
): { start: string; end: string | null }[] {
  if (!open) return []
  if (!close) return [{ start: open, end: null }]

  const openMin = toMinutes(open)
  let closeMin = toMinutes(close)
  if (closeMin <= openMin) closeMin += 1440 // closes after midnight

  const duration = closeMin - openMin
  if (duration < HANDOFF_MIN_HOURS * 60) return [{ start: open, end: close }]

  // Split down the middle, rounded to the nearest quarter hour.
  const mid = openMin + Math.round(duration / 2 / 15) * 15
  return [
    { start: open, end: fromMinutes(mid) },
    { start: fromMinutes(mid), end: close },
  ]
}

/** Minutes for `t`, pushed past midnight if it lands at or before `baseMin`. */
function minutesAfter(baseMin: number, t: string): number {
  const m = toMinutes(t)
  return m <= baseMin ? m + 1440 : m
}

export interface DayShift {
  slot_order: number
  start: string
  end: string | null // null = that day's close
}

/**
 * The shifts to staff for one location on one day.
 *
 * Food Village uses its configured templates, each clamped to the day's actual
 * opening hours — so a day opening later than usual shifts the openers forward
 * rather than scheduling someone before the doors open, and a template falling
 * entirely outside the day is dropped.
 *
 * Stadium has no templates: its shifts come from splitting the day's hours,
 * which yields 1 shift on a short or open-ended day and 2 on a long one.
 */
export function shiftsForDay(
  location: Location,
  hours: OperatingHours | null,
  templates: ShiftTemplate[]
): DayShift[] {
  if (!hours || !hours.is_open || !hours.open_time) return []

  const relevant = templates
    .filter(t => t.location === location)
    .sort((a, b) => a.slot_order - b.slot_order)

  if (relevant.length === 0) {
    return planShifts(hours.open_time, hours.close_time).map((s, i) => ({
      slot_order: i + 1,
      start: s.start,
      end: s.end,
    }))
  }

  const openMin = toMinutes(hours.open_time)
  const closeMin = hours.close_time ? minutesAfter(openMin, hours.close_time) : null

  const out: DayShift[] = []
  for (const t of relevant) {
    // Drop a template whose window ends before the day even opens.
    if (t.end_time) {
      const tEnd = minutesAfter(toMinutes(t.start_time), t.end_time)
      if (tEnd <= openMin) continue
    }

    const startMin = Math.max(toMinutes(t.start_time), openMin)
    if (closeMin !== null && startMin >= closeMin) continue // starts at or after close

    let end: string | null
    if (!t.end_time) {
      end = hours.close_time // runs to close, which may itself be open-ended
    } else {
      const endMin = minutesAfter(startMin, t.end_time)
      end = closeMin !== null && endMin > closeMin ? hours.close_time : fromMinutes(endMin)
    }

    out.push({ slot_order: t.slot_order, start: fromMinutes(startMin), end })
  }
  return out
}

/** Where a date sits in the tournament, or null if it falls outside it. */
export function getPeriodAndDayIndex(
  date: string,
  settings: TournamentSettings
): { period: number; day_index: number } | null {
  const { preTournament, week1, week2, week3 } = getTournamentDates(settings)
  const periods = [preTournament, week1, week2, week3]
  for (let period = 0; period < periods.length; period++) {
    const day_index = periods[period].indexOf(date)
    if (day_index !== -1) return { period, day_index }
  }
  return null
}

/** Key for looking hours up by location and day. */
export function hoursKey(location: Location, period: number, dayIndex: number): string {
  return `${location}:${period}:${dayIndex}`
}

export function buildHoursMap(rows: OperatingHours[]): Map<string, OperatingHours> {
  const map = new Map<string, OperatingHours>()
  rows.forEach(r => map.set(hoursKey(r.location, r.period, r.day_index), r))
  return map
}

/** Hours for a given location on a given date, or null if the date is outside the tournament. */
export function getHoursForDate(
  map: Map<string, OperatingHours>,
  location: Location,
  date: string,
  settings: TournamentSettings
): OperatingHours | null {
  const pos = getPeriodAndDayIndex(date, settings)
  if (!pos) return null
  return map.get(hoursKey(location, pos.period, pos.day_index)) ?? null
}

/** "10am → 10pm", "6pm → Close", or "Closed". */
export function formatHoursRange(h: OperatingHours | null): string {
  if (!h || !h.is_open) return 'Closed'
  if (!h.open_time) return '—'
  return `${formatTime(h.open_time)} → ${formatTime(h.close_time)}`
}
