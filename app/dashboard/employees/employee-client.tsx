'use client'

import { useState, useTransition } from 'react'
import {
  Employee, SKILLS, Location, LOCATION_LABELS, ShiftPeriod, SHIFT_PERIODS,
  WeeklyAvailability, DAY_LABELS, OPEN_AVAILABILITY, WEEKDAYS_ONLY_AVAILABILITY,
  isOpenAvailability,
} from '@/lib/types'

import { addEmployee, updateEmployee, toggleEmployeeActive } from './actions'

const LOCATION_OPTIONS: { id: Location }[] = [
  { id: 'food_village' },
  { id: 'stadium' },
]

const EMPTY_AVAILABILITY: WeeklyAvailability = {
  '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [],
}

/**
 * Short badges describing a weekly pattern. Says nothing extra when someone is
 * fully open beyond the "Open" badge, so an unrestricted employee stays quiet.
 */
function summarizeAvailability(w: WeeklyAvailability | null | undefined): string[] {
  if (!w || isOpenAvailability(w)) return ['Open']

  const days = DAY_LABELS.map((_, i) => w[String(i)] ?? [])
  if (days.every(d => d.length === 0)) return ['Never available']

  const workingDays = DAY_LABELS.filter((_, i) => days[i].length > 0)
  const out: string[] = []

  // Name the common day pattern rather than listing five days.
  const weekdaysOn = [0, 1, 2, 3, 4].every(i => days[i].length > 0)
  const weekendOff = [5, 6].every(i => days[i].length === 0)
  if (weekdaysOn && weekendOff) out.push('Mon–Fri')
  else out.push(workingDays.join(' '))

  // Only mention shifts when every working day uses the same limited set.
  const shiftSets = new Set(days.filter(d => d.length > 0).map(d => d.join(',')))
  if (shiftSets.size === 1) {
    const only = [...shiftSets][0].split(',') as ShiftPeriod[]
    if (only.length < SHIFT_PERIODS.length) {
      out.push(SHIFT_PERIODS.filter(s => only.includes(s.id)).map(s => s.label).join('/'))
    }
  } else {
    out.push('Varies by day')
  }
  return out
}

function normalizeAvailability(w: WeeklyAvailability | null | undefined): WeeklyAvailability {
  // A missing pattern means unrestricted, matching how the scheduler reads it.
  if (!w) return { ...OPEN_AVAILABILITY }
  const out: WeeklyAvailability = { ...EMPTY_AVAILABILITY }
  DAY_LABELS.forEach((_, i) => { out[String(i)] = w[String(i)] ?? [] })
  return out
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md my-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Held in state rather than as checkboxes so the presets and the per-day
  // All/Off toggles can rewrite the whole grid at once. Submitted as JSON.
  const [avail, setAvail] = useState<WeeklyAvailability>(() =>
    normalizeAvailability(employee?.weekly_availability)
  )

  function toggleShift(dayIndex: number, shift: ShiftPeriod) {
    setAvail(prev => {
      const key = String(dayIndex)
      const current = prev[key] ?? []
      const next = current.includes(shift)
        ? current.filter(s => s !== shift)
        : [...current, shift]
      // Keep AM/MID/PM order stable so the stored value doesn't churn.
      const ordered = SHIFT_PERIODS.filter(s => next.includes(s.id)).map(s => s.id)
      return { ...prev, [key]: ordered }
    })
  }

  function toggleDay(dayIndex: number) {
    setAvail(prev => {
      const key = String(dayIndex)
      const isOn = (prev[key] ?? []).length > 0
      return { ...prev, [key]: isOn ? [] : SHIFT_PERIODS.map(s => s.id) }
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = employee
        ? await updateEmployee(employee.id, fd)
        : await addEmployee(fd)
      // Stay open on failure so the edits aren't lost behind a closed dialog.
      if (result.ok) onClose()
      else setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <div className="font-semibold mb-0.5">Not saved</div>
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-semibold text-gray-500 mb-1.5">Name *</label>
        <input name="name" defaultValue={employee?.name} required
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Email</label>
          <input name="email" type="email" defaultValue={employee?.email ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Phone</label>
          <input name="phone" defaultValue={employee?.phone ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-500 mb-1.5">
          Can work these positions *
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Auto-Schedule only places someone in a position they&apos;re ticked for.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SKILLS.map(s => (
            <label
              key={s.id}
              className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition"
            >
              <input
                type="checkbox"
                name="skills"
                value={s.id}
                defaultChecked={employee?.skills?.includes(s.id) ?? false}
                className="w-5 h-5 accent-gray-900"
              />
              <span className="text-sm text-gray-700">{s.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-500 mb-1.5">
          Can work at *
        </label>
        <div className="grid grid-cols-2 gap-2">
          {LOCATION_OPTIONS.map(l => (
            <label
              key={l.id}
              className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition"
            >
              <input
                type="checkbox"
                name="locations"
                value={l.id}
                defaultChecked={employee ? (employee.locations ?? []).includes(l.id) : true}
                className="w-5 h-5 accent-gray-900"
              />
              <span className="text-sm text-gray-700">{LOCATION_LABELS[l.id]}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1.5">
          <label className="block text-sm font-semibold text-gray-500">
            Available shifts, by day
          </label>
          {isOpenAvailability(avail) && (
            <span className="text-xs font-semibold text-emerald-600">OPEN — all shifts, all days</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Tap to set which shifts they work each day. Individual dates they can&apos;t work
          go on the Availability screen — this is their standing pattern.
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" onClick={() => setAvail({ ...OPEN_AVAILABILITY })}
            className="px-3 py-2 min-h-[40px] text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition">
            Open (7 days)
          </button>
          <button type="button" onClick={() => setAvail({ ...WEEKDAYS_ONLY_AVAILABILITY })}
            className="px-3 py-2 min-h-[40px] text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition">
            Mon–Fri
          </button>
          <button type="button" onClick={() => setAvail({ ...EMPTY_AVAILABILITY })}
            className="px-3 py-2 min-h-[40px] text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition">
            Clear
          </button>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[320px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">Day</th>
                {SHIFT_PERIODS.map(s => (
                  <th key={s.id} className="text-center text-xs font-semibold text-gray-400 px-2 py-2">
                    {s.label}
                  </th>
                ))}
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {DAY_LABELS.map((day, i) => {
                const key = String(i)
                const on = avail[key] ?? []
                const isWeekend = i >= 5
                return (
                  <tr key={day} className={`border-t border-gray-50 ${isWeekend ? 'bg-gray-50/50' : ''}`}>
                    <td className="px-3 py-1.5">
                      <span className={`text-sm font-medium ${on.length ? 'text-gray-900' : 'text-gray-400'}`}>
                        {day}
                      </span>
                    </td>
                    {SHIFT_PERIODS.map(s => (
                      <td key={s.id} className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleShift(i, s.id)}
                          className={`w-11 h-11 rounded-lg text-xs font-bold border transition active:scale-95 ${
                            on.includes(s.id)
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : 'bg-gray-100 text-gray-300 border-gray-200'
                          }`}
                          aria-label={`${day} ${s.label}`}
                        >
                          {on.includes(s.id) ? s.label : '·'}
                        </button>
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" onClick={() => toggleDay(i)}
                        className="text-xs text-gray-400 hover:text-gray-900 px-2 py-2 rounded hover:bg-gray-100 active:bg-gray-200 transition">
                        {on.length ? 'Off' : 'All'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <input type="hidden" name="weekly_availability" value={JSON.stringify(avail)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">
            Guaranteed days per week
          </label>
          <input
            type="number"
            name="min_shifts_per_week"
            min={1}
            max={21}
            placeholder="No deal"
            defaultValue={employee?.min_shifts_per_week ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">
            Max shifts per week
          </label>
          <input
            type="number"
            name="max_shifts_per_week"
            min={1}
            max={21}
            placeholder="No limit"
            defaultValue={employee?.max_shifts_per_week ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <p className="col-span-2 text-xs text-gray-400">
          Both counted per period, so Week 1, Week 2 and Week 3 each get their own
          allowance. Leave <strong>Guaranteed</strong> blank unless there&apos;s an
          agreement — Auto-Schedule books those days first, then spreads what&apos;s left
          evenly across everyone else. Leave <strong>Max</strong> blank for no limit; it
          does not apply to managers, who work the hours they have.
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition">
          <input
            type="checkbox"
            name="is_manager"
            defaultChecked={employee?.is_manager ?? false}
            className="w-5 h-5 accent-purple-600"
          />
          <span className="text-sm text-gray-700">
            Manager <span className="text-gray-400">— gets the MGR badge and is preferred for Chef</span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition">
          <input
            type="checkbox"
            name="works_full_day"
            defaultChecked={employee?.works_full_day ?? false}
            className="w-5 h-5 accent-blue-600 mt-0.5"
          />
          <span className="text-sm text-gray-700">
            Works full days{' '}
            <span className="text-gray-400">
              — holds one position from open to close instead of a shift, so that position
              needs nobody on its later shifts. The AM/MID/PM ticks above then only decide
              which days they work.
            </span>
          </span>
        </label>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={pending}
          className="flex-1 bg-gray-900 text-white text-sm font-semibold rounded-lg py-3 min-h-[48px] hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition">
          {pending ? 'Saving…' : employee ? 'Save Changes' : 'Add Employee'}
        </button>
        <button type="button" onClick={onClose}
          className="px-4 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg py-3 min-h-[48px] hover:bg-gray-50 active:bg-gray-100 transition">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function EmployeeClient({ employees }: { employees: Employee[] }) {
  const [filter, setFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = employees.filter(e => {
    if (filter === 'active') return e.active
    if (filter === 'inactive') return !e.active
    return true
  })

  function handleToggle(e: Employee) {
    setListError(null)
    startTransition(async () => {
      const result = await toggleEmployeeActive(e.id, !e.active)
      if (!result.ok) setListError(result.error)
    })
  }

  return (
    <div>
      {listError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <div className="font-semibold mb-0.5">Not saved</div>
          {listError}
        </div>
      )}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['active', 'inactive', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2.5 min-h-[44px] rounded-md text-sm font-semibold transition active:scale-95 ${filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 transition">
          + Add Employee
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Can work</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Contact</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="text-center py-12 text-sm text-gray-400">No employees found.</td></tr>
            )}
            {filtered.map(emp => (
              <tr key={emp.id} className="border-t border-gray-50 hover:bg-gray-50 transition">
                <td className="px-5 py-3">
                  <div className="text-sm font-semibold text-gray-900">{emp.name}</div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1 items-center">
                    {emp.is_manager && (
                      <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-purple-100 text-purple-700">MGR</span>
                    )}
                    {(emp.skills ?? []).length === 0 ? (
                      <span className="text-xs text-amber-600">No positions set</span>
                    ) : (
                      SKILLS.filter(s => emp.skills?.includes(s.id)).map(s => (
                        <span key={s.id} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                          {s.label}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 items-center mt-1">
                    {/* Only worth showing when it actually narrows things. */}
                    {(emp.locations ?? []).length === 1 && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                        {LOCATION_LABELS[emp.locations[0]]} only
                      </span>
                    )}
                    {summarizeAvailability(emp.weekly_availability).map((label, n) => (
                      <span
                        key={n}
                        className={`text-[11px] px-2 py-0.5 rounded border ${
                          label === 'Never available'
                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                            : label === 'Open'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : 'bg-gray-50 text-gray-500 border-gray-100'
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                    {emp.works_full_day && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-semibold">
                        Full days
                      </span>
                    )}
                    {emp.min_shifts_per_week != null && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold">
                        {emp.min_shifts_per_week} days guaranteed
                      </span>
                    )}
                    {emp.max_shifts_per_week != null && !emp.is_manager && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-100">
                        Max {emp.max_shifts_per_week}/wk
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-xs text-gray-500">
                  {emp.email && <div>{emp.email}</div>}
                  {emp.phone && <div>{emp.phone}</div>}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(emp)}
                      className="text-sm text-gray-500 hover:text-gray-900 font-medium transition px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200">
                      Edit
                    </button>
                    <button onClick={() => handleToggle(emp)} disabled={pending}
                      className={`text-sm font-medium transition px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200 ${emp.active ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'}`}>
                      {emp.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Add Employee" onClose={() => setShowAdd(false)}>
          <EmployeeForm onClose={() => setShowAdd(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Employee" onClose={() => setEditing(null)}>
          <EmployeeForm employee={editing} onClose={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}
