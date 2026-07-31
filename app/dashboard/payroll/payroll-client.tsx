'use client'

import { Employee, TimeEntry, TournamentSettings, getTournamentDates } from '@/lib/types'

type EntryMap = Map<string, number | null> // key: `${empId}:${date}` → hours

function buildEntryMap(entries: TimeEntry[]): EntryMap {
  const map = new Map<string, number | null>()
  entries.forEach(e => map.set(`${e.employee_id}:${e.date}`, e.hours_calculated))
  return map
}

export default function PayrollClient({
  employees,
  entries,
  settings,
}: {
  employees: Employee[]
  entries: TimeEntry[]
  settings: TournamentSettings
}) {
  const { preTournament, week1, week2, week3 } = getTournamentDates(settings)
  const periods = [
    { label: 'Pre-event', dates: preTournament },
    { label: 'Week 1', dates: week1 },
    { label: 'Week 2', dates: week2 },
    { label: 'Week 3', dates: week3 },
  ]

  const entryMap = buildEntryMap(entries)

  function getHours(empId: string, date: string): number | null {
    return entryMap.get(`${empId}:${date}`) ?? null
  }

  function getTotalForPeriod(empId: string, dates: string[]): number {
    return dates.reduce((sum, d) => sum + (getHours(empId, d) ?? 0), 0)
  }

  function getGrandTotal(empId: string): number {
    return periods.reduce((sum, p) => sum + getTotalForPeriod(empId, p.dates), 0)
  }

  async function handleExcel() {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // Create a sheet for each period
    for (const period of periods) {
      const headers = ['Employee', ...period.dates.map(d => {
        const dd = new Date(d + 'T00:00:00')
        return dd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      }), 'Period Total']

      const rows = employees.map(emp => {
        const row: (string | number)[] = [emp.name]
        period.dates.forEach(d => {
          const h = getHours(emp.id, d)
          row.push(h !== null ? h : '')
        })
        row.push(getTotalForPeriod(emp.id, period.dates))
        return row
      })

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

      // Column widths
      ws['!cols'] = [{ wch: 20 }, ...period.dates.map(() => ({ wch: 10 })), { wch: 14 }]

      XLSX.utils.book_append_sheet(wb, ws, period.label)
    }

    // Grand total sheet
    const allDates = periods.flatMap(p => p.dates)
    const summaryHeaders = ['Employee', 'Pre-event Total', 'Week 1 Total', 'Week 2 Total', 'Week 3 Total', 'Grand Total']
    const summaryRows = employees.map(emp => [
      emp.name,
      ...periods.map(p => getTotalForPeriod(emp.id, p.dates)),
      getGrandTotal(emp.id),
    ])
    const summaryWs = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows])
    summaryWs['!cols'] = [{ wch: 20 }, ...periods.map(() => ({ wch: 16 })), { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    XLSX.writeFile(wb, `King_USOpen_${settings.year}_Payroll.xlsx`)
  }

  const allDates = periods.flatMap(p => p.dates)

  return (
    <div>
      {/* Summary table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-5">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">Hours Summary</span>
          <button
            onClick={handleExcel}
            className="px-5 py-2.5 min-h-[44px] bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition"
          >
            ↓ Export Excel
          </button>
        </div>
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5 w-36 sticky left-0 bg-white">Employee</th>
              {periods.map(p => (
                <th key={p.label} colSpan={p.dates.length + 1} className="text-center text-xs font-semibold text-gray-500 px-2 py-2.5 border-l border-gray-100">
                  {p.label}
                </th>
              ))}
              <th className="text-center text-xs font-semibold text-gray-500 px-3 py-2.5 border-l border-gray-100">Grand Total</th>
            </tr>
            <tr className="border-b border-gray-50">
              <th className="sticky left-0 bg-white"></th>
              {periods.map(p => (
                <>
                  {p.dates.map(d => {
                    const dd = new Date(d + 'T00:00:00')
                    return (
                      <th key={d} className="text-center text-[10px] text-gray-400 px-1 py-1 min-w-[48px] font-medium">
                        {dd.toLocaleDateString('en-US', { weekday: 'short' })}<br />
                        {dd.getDate()}
                      </th>
                    )
                  })}
                  <th key={`${p.label}-total`} className="text-center text-[10px] text-gray-500 px-2 py-1 min-w-[54px] font-semibold border-l border-gray-100">
                    Total
                  </th>
                </>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2 sticky left-0 bg-white">
                  <div className="text-xs font-semibold text-gray-900">{emp.name}</div>
                  {emp.role === 'manager' && (
                    <div className="text-[10px] text-purple-600 font-bold uppercase">MGR</div>
                  )}
                </td>
                {periods.map(p => (
                  <>
                    {p.dates.map(d => {
                      const h = getHours(emp.id, d)
                      return (
                        <td key={d} className="text-center px-1 py-2 text-xs">
                          {h !== null ? (
                            <span className="font-medium text-gray-800">{h}</span>
                          ) : (
                            <span className="text-gray-200">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td key={`${p.label}-total`} className="text-center px-2 py-2 border-l border-gray-100">
                      <span className="text-xs font-bold text-gray-700">
                        {getTotalForPeriod(emp.id, p.dates).toFixed(1)}
                      </span>
                    </td>
                  </>
                ))}
                <td className="text-center px-3 py-2 border-l border-gray-100">
                  <span className="text-sm font-bold text-gray-900">
                    {getGrandTotal(emp.id).toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50">
              <td className="px-4 py-2 text-xs font-bold text-gray-600 sticky left-0 bg-gray-50">Daily Total</td>
              {periods.map(p => (
                <>
                  {p.dates.map(d => {
                    const dayTotal = employees.reduce((sum, emp) => sum + (getHours(emp.id, d) ?? 0), 0)
                    return (
                      <td key={d} className="text-center px-1 py-2">
                        <span className="text-xs font-semibold text-gray-700">{dayTotal > 0 ? dayTotal.toFixed(1) : '—'}</span>
                      </td>
                    )
                  })}
                  <td key={`${p.label}-daytotal`} className="border-l border-gray-200 px-2 py-2 text-center">
                    <span className="text-xs font-bold text-gray-700">
                      {employees.reduce((sum, emp) => sum + getTotalForPeriod(emp.id, p.dates), 0).toFixed(1)}
                    </span>
                  </td>
                </>
              ))}
              <td className="border-l border-gray-200 px-3 py-2 text-center">
                <span className="text-sm font-bold text-gray-900">
                  {employees.reduce((sum, emp) => sum + getGrandTotal(emp.id), 0).toFixed(1)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-6 text-sm text-gray-400">
          No time entries yet. Add them in{' '}
          <a href="/dashboard/timetracking" className="text-gray-600 font-medium hover:underline">Time Tracking</a>.
        </div>
      )}
    </div>
  )
}
