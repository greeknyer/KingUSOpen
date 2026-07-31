import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  getTournamentDates, formatTime, FOOD_VILLAGE_POSITIONS, STADIUM_POSITIONS,
  LOCATION_LABELS, buildHoursMap, getHoursForDate, formatHoursRange,
  Employee, ScheduleAssignment, OperatingHours, Location, PositionMeta, canWorkAnyPosition,
} from '@/lib/types'

const PERIOD_LABELS = ['Pre-tournament', 'Week 1', 'Week 2', 'Week 3']

/**
 * A week of the schedule as a sheet to put on the board.
 *
 * Built from the assignments themselves rather than from the slot rules the
 * editing grid uses: what goes on a wall is who is in and when, so a position
 * nobody is on that day is simply absent instead of an empty cell inviting an
 * assignment. That also keeps this page from drifting as those rules change.
 */
export default async function PrintSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = Math.min(3, Math.max(0, parseInt(periodParam ?? '1', 10) || 0))

  const supabase = await createClient()
  const [{ data: settingsRows }, { data: operatingHours }] = await Promise.all([
    supabase.from('tournament_settings').select('*').order('year', { ascending: false }).limit(1),
    supabase.from('operating_hours').select('*'),
  ])
  const settings = settingsRows?.[0]

  if (!settings) {
    return (
      <div className="p-8 text-sm text-gray-600">
        No tournament configured.{' '}
        <Link href="/dashboard/setup" className="font-semibold underline">Go to Setup</Link>
      </div>
    )
  }

  const { preTournament, week1, week2, week3 } = getTournamentDates(settings)
  const dates = [preTournament, week1, week2, week3][period]

  const { data: assignmentRows } = await supabase
    .from('schedule_assignments')
    .select('*, employee:employees(*)')
    .in('date', dates)
    .order('slot_order')

  const assignments = (assignmentRows ?? []) as ScheduleAssignment[]
  const hoursMap = buildHoursMap(((operatingHours ?? []) as OperatingHours[]).filter(h => h.year === settings.year))

  // The GM runs Food Village from outside the position grid, so they're named
  // in the header rather than appearing as a row.
  const managerIds = [settings.general_manager_id, settings.stadium_manager_id].filter(Boolean)
  const { data: managerRows } = managerIds.length
    ? await supabase.from('employees').select('*').in('id', managerIds as string[])
    : { data: null }
  const managers = (managerRows ?? []) as Employee[]
  const gm = managers.find(m => m.id === settings.general_manager_id) ?? null
  // A Stadium manager with no positions supervises rather than working one, so
  // they never appear in the grid and have to be named alongside the GM.
  const stadiumMgr = managers.find(m => m.id === settings.stadium_manager_id) ?? null
  const stadiumMgrOffGrid =
    stadiumMgr && !canWorkAnyPosition(stadiumMgr, 'stadium') ? stadiumMgr : null

  function forCell(location: Location, position: string, date: string) {
    return assignments
      .filter(a => a.date === date && a.location === location && a.position === position && a.employee_id)
      .sort((a, b) => a.slot_order - b.slot_order)
  }

  /** Only positions somebody is actually on this week get a row. */
  function usedPositions(location: Location, all: PositionMeta[]) {
    return all.filter(p =>
      dates.some(d => forCell(location, p.id, d).length > 0)
    )
  }

  function dayHeader(date: string) {
    const d = new Date(date + 'T00:00:00')
    return {
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      day: `${d.getMonth() + 1}/${d.getDate()}`,
    }
  }

  const anyDraft = assignments.some(a => a.status === 'draft')

  // Each person's week, for the staff who read a board looking for their own name.
  const byPerson = new Map<string, { name: string; days: { date: string; text: string }[] }>()
  for (const date of dates) {
    for (const a of assignments) {
      if (a.date !== date || !a.employee_id || !a.employee) continue
      const entry = byPerson.get(a.employee_id) ?? { name: a.employee.name, days: [] }
      const label = [...FOOD_VILLAGE_POSITIONS, ...STADIUM_POSITIONS].find(p => p.id === a.position)?.label ?? a.position
      entry.days.push({
        date,
        text: `${label} · ${formatTime(a.planned_start)}–${formatTime(a.planned_end)}`,
      })
      byPerson.set(a.employee_id, entry)
    }
  }
  const people = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name))

  const locationTable = (location: Location, positions: PositionMeta[]) => {
    const rows = usedPositions(location, positions)
    if (rows.length === 0) return null
    return (
      <div className="mb-6 break-inside-avoid">
        <h2 className="text-base font-bold mb-1.5">{LOCATION_LABELS[location]}</h2>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-gray-400 bg-gray-100 px-2 py-1 text-left w-[110px]">Position</th>
              {dates.map(d => {
                const h = getHoursForDate(hoursMap, location, d, settings!)
                const { weekday, day } = dayHeader(d)
                return (
                  <th key={d} className="border border-gray-400 bg-gray-100 px-1 py-1 text-center">
                    <div className="font-bold">{weekday} {day}</div>
                    <div className="font-normal text-[9px] text-gray-600">{formatHoursRange(h)}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(pos => (
              <tr key={pos.id}>
                <td className="border border-gray-400 px-2 py-1 font-semibold">{pos.label}</td>
                {dates.map(d => {
                  const cell = forCell(location, pos.id, d)
                  return (
                    <td key={d} className="border border-gray-400 px-1 py-1 align-top text-center">
                      {cell.length === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        cell.map(a => (
                          <div key={a.id} className="leading-tight mb-0.5 last:mb-0">
                            <div className="font-semibold">{a.employee?.name ?? '—'}</div>
                            <div className="text-[9px] text-gray-600">
                              {formatTime(a.planned_start)}–{formatTime(a.planned_end)}
                            </div>
                          </div>
                        ))
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="bg-white text-black">
      {/* Screen-only controls. The print stylesheet drops these and the sidebar. */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 flex-wrap border-b border-gray-200 bg-white px-6 py-3">
        <Link href="/dashboard/schedule" className="px-3 py-2 min-h-[44px] flex items-center text-sm font-semibold text-gray-600 hover:text-gray-900">
          ← Back
        </Link>
        {PERIOD_LABELS.map((label, i) => (
          <Link
            key={i}
            href={`/dashboard/schedule/print?period=${i}`}
            className={`px-3 py-2 min-h-[44px] flex items-center rounded-lg text-sm font-semibold ${
              i === period ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </Link>
        ))}
        <span className="ml-auto text-xs text-gray-500">
          Use your browser&apos;s Print — on iPad, Share → Print. Landscape fits best.
        </span>
      </div>

      <div className="p-6 print:p-0">
        <div className="mb-4 flex items-end justify-between border-b-2 border-black pb-2">
          <div>
            <h1 className="text-xl font-bold">King Souvlaki · US Open {settings.year}</h1>
            <p className="text-sm font-semibold">{PERIOD_LABELS[period]}</p>
          </div>
          {anyDraft && (
            <span className="text-xs font-bold uppercase border-2 border-black px-2 py-1">
              Draft — not final
            </span>
          )}
        </div>

        {(gm || stadiumMgrOffGrid) && (
          <div className="mb-4 text-[11px] space-y-0.5">
            {gm && (
              <p><strong>General Manager:</strong> {gm.name} — Food Village, open to close, every open day.</p>
            )}
            {stadiumMgrOffGrid && (
              <p><strong>Stadium Manager:</strong> {stadiumMgrOffGrid.name} — Stadium, open to close, every open day.</p>
            )}
          </div>
        )}

        {locationTable('food_village', FOOD_VILLAGE_POSITIONS)}
        {locationTable('stadium', STADIUM_POSITIONS)}

        {people.length > 0 && (
          <div className="break-before-page">
            <h2 className="text-base font-bold mb-1.5">By person</h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 px-2 py-1 text-left w-[130px]">Name</th>
                  {dates.map(d => {
                    const { weekday, day } = dayHeader(d)
                    return (
                      <th key={d} className="border border-gray-400 bg-gray-100 px-1 py-1 text-center">
                        {weekday} {day}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {people.map(p => (
                  <tr key={p.name}>
                    <td className="border border-gray-400 px-2 py-1 font-semibold">{p.name}</td>
                    {dates.map(d => {
                      const entry = p.days.find(x => x.date === d)
                      return (
                        <td key={d} className="border border-gray-400 px-1 py-1 text-center text-[9px] leading-tight">
                          {entry ? entry.text : <span className="text-gray-300">off</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {assignments.length === 0 && (
          <p className="text-sm text-gray-600">
            Nothing scheduled for {PERIOD_LABELS[period]} yet.
          </p>
        )}
      </div>
    </div>
  )
}
