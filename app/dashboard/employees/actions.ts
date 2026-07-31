'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { SKILLS, Skill, Location, ShiftPeriod, SHIFT_PERIODS, WeeklyAvailability, DAY_LABELS } from '@/lib/types'

/**
 * Skills arrive as repeated `skills` checkbox values. Filtered against the
 * known list so a tampered form can't write a value the CHECK constraint
 * would reject.
 */
function readSkills(formData: FormData): Skill[] {
  const valid = new Set<string>(SKILLS.map(s => s.id))
  return formData
    .getAll('skills')
    .map(String)
    .filter((s): s is Skill => valid.has(s))
}

/**
 * The weekly grid arrives as a JSON blob from a hidden field. Rebuilt key by
 * key against the known days and shifts so nothing unexpected reaches the
 * column, and so a malformed value degrades to "no availability" for that day
 * rather than failing the whole save.
 */
function readWeeklyAvailability(formData: FormData): WeeklyAvailability {
  const validShifts = new Set<string>(SHIFT_PERIODS.map(s => s.id))
  const out: WeeklyAvailability = {}
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(String(formData.get('weekly_availability') ?? '{}'))
  } catch {
    parsed = {}
  }
  DAY_LABELS.forEach((_, i) => {
    const raw = parsed[String(i)]
    const list = Array.isArray(raw) ? raw.map(String) : []
    out[String(i)] = SHIFT_PERIODS
      .filter(s => list.includes(s.id) && validShifts.has(s.id))
      .map(s => s.id) as ShiftPeriod[]
  })
  return out
}

/** Blank means no cap. Out-of-range values are dropped rather than clamped. */
function readMaxShifts(formData: FormData): number | null {
  const raw = String(formData.get('max_shifts_per_week') ?? '').trim()
  if (!raw) return null
  const n = parseInt(raw, 10)
  return Number.isInteger(n) && n >= 1 && n <= 21 ? n : null
}

function readLocations(formData: FormData): Location[] {
  const valid = new Set<string>(['food_village', 'stadium'])
  return formData
    .getAll('locations')
    .map(String)
    .filter((l): l is Location => valid.has(l))
}

export type SaveResult = { ok: true } | { ok: false; error: string }

/**
 * Turn a Supabase error into something the form can show. A write that Postgres
 * rejects otherwise looks identical to one that succeeded — 42703 (missing
 * column) in particular means a migration hasn't been run yet.
 */
function toResult(error: { message: string; code?: string } | null): SaveResult {
  if (!error) return { ok: true }
  if (error.code === '42703' || error.code === 'PGRST205') {
    return {
      ok: false,
      error:
        'The database is missing columns this form writes. Run the pending migrations in ' +
        `supabase/migrations, then try again. (${error.message})`,
    }
  }
  return { ok: false, error: error.message }
}

export async function addEmployee(formData: FormData): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('employees').insert({
    name: formData.get('name') as string,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    is_manager: formData.get('is_manager') === 'on',
    skills: readSkills(formData),
    locations: readLocations(formData),
    weekly_availability: readWeeklyAvailability(formData),
    max_shifts_per_week: readMaxShifts(formData),
  })
  if (error) return toResult(error)
  revalidatePath('/dashboard/employees')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

export async function updateEmployee(id: string, formData: FormData): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('employees').update({
    name: formData.get('name') as string,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    is_manager: formData.get('is_manager') === 'on',
    skills: readSkills(formData),
    locations: readLocations(formData),
    weekly_availability: readWeeklyAvailability(formData),
    max_shifts_per_week: readMaxShifts(formData),
  }).eq('id', id)
  if (error) return toResult(error)
  revalidatePath('/dashboard/employees')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}

export async function toggleEmployeeActive(id: string, active: boolean): Promise<SaveResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('employees').update({ active }).eq('id', id)
  if (error) return toResult(error)
  revalidatePath('/dashboard/employees')
  revalidatePath('/dashboard/schedule')
  return { ok: true }
}
