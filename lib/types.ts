export type Role = 'manager' | 'crew'

export interface Employee {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: Role
  active: boolean
  created_at: string
}

export interface TournamentSettings {
  id: string
  year: number
  start_date: string          // First Monday of Week 1 (YYYY-MM-DD)
  pre_tournament_days: number // Days before week 1 (default 3)
}

export interface StadiumOpenDay {
  id: string
  year: number
  period: number     // 0=pre-tournament, 1=week1, 2=week2, 3=week3
  day_index: number  // 0-6, index within that period
  is_open: boolean
}

export interface Register4Config {
  id: string
  year: number
  period: number   // 0=pre, 1=week1, 2=week2, 3=week3
  is_active: boolean
}

export interface Availability {
  id: string
  employee_id: string
  date: string
  available: boolean
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

// Position metadata
export const FOOD_VILLAGE_POSITIONS: { id: Position; label: string; section: string; configurable?: boolean }[] = [
  { id: 'register_1', label: 'Register 1', section: 'Registers' },
  { id: 'register_2', label: 'Register 2', section: 'Registers' },
  { id: 'register_3', label: 'Register 3', section: 'Registers' },
  { id: 'register_4', label: 'Register 4', section: 'Registers', configurable: true },
  { id: 'prep_1', label: 'Prep 1', section: 'Prep' },
  { id: 'prep_2', label: 'Prep 2', section: 'Prep' },
  { id: 'prep_3', label: 'Prep 3', section: 'Prep' },
  { id: 'prep_4', label: 'Prep 4', section: 'Prep' },
  { id: 'chef', label: 'Chef', section: 'Kitchen' },
  { id: 'salads', label: 'Salads', section: 'Kitchen' },
]

export const STADIUM_POSITIONS: { id: Position; label: string }[] = [
  { id: 'stadium_register', label: 'Register' },
  { id: 'stadium_prep', label: 'Prep' },
]

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
