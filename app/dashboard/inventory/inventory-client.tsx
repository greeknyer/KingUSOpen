'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  TournamentSettings, InventoryItem, InventoryCount, InventoryDelivery, Location,
  LOCATION_LABELS, getTournamentDates,
} from '@/lib/types'
import { saveDeliveries } from './actions'

const LOCATIONS: Location[] = ['food_village', 'stadium']

export default function InventoryClient({
  settings,
  items,
  counts,
  deliveries,
}: {
  settings: TournamentSettings
  items: InventoryItem[]
  counts: InventoryCount[]
  deliveries: InventoryDelivery[]
}) {
  const { allDates } = getTournamentDates(settings)
  const today = new Date().toISOString().split('T')[0]
  // Today when the tournament is running, otherwise its first day. Falling back
  // to the LAST day meant opening the screen months beforehand and landing on
  // the final Sunday, which reads as a bug because nothing is on it.
  const defaultDate = allDates.includes(today) ? today : (allDates[0] ?? today)

  const [location, setLocation] = useState<Location>('food_village')
  const [date, setDate] = useState(defaultDate)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})

  const locationItems = items.filter(i => i.location === location && i.active)

  /** Every count for one product, oldest first. */
  function countsFor(itemId: string) {
    return counts
      .filter(c => c.item_id === itemId)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /** Every delivery of one product, oldest first. */
  function deliveriesFor(itemId: string) {
    return deliveries
      .filter(d => d.item_id === itemId)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  function deliveredOn(itemId: string, d: string): number | null {
    return deliveriesFor(itemId).find(x => x.date === d)?.quantity ?? null
  }

  function valueFor(itemId: string): string {
    const key = `${date}:${itemId}`
    if (key in draft) return draft[key]
    const saved = deliveredOn(itemId, date)
    return saved == null ? '' : String(saved)
  }

  function setValue(itemId: string, v: string) {
    setDraft(prev => ({ ...prev, [`${date}:${itemId}`]: v }))
    setMessage('')
  }

  /**
   * What one product has come to.
   *
   * Received is every delivery across the tournament, opening stock included —
   * 20 to start and 10 the next morning is 30 received, whatever is on the
   * shelf now.
   *
   * Used is measured against the LAST count rather than the running total,
   * because a delivery that arrived after that count hasn't been counted yet.
   * Subtracting it would report stock that is sitting there as eaten.
   */
  function totalsFor(itemId: string) {
    const gotIn = deliveriesFor(itemId)
    const received = gotIn.reduce((sum, d) => sum + (d.quantity ?? 0), 0)

    const counted = countsFor(itemId).filter(c => c.on_hand != null)
    const last = counted[counted.length - 1]
    if (!last) return { received, onHand: null, onHandDate: null, used: null }

    const receivedByThen = gotIn
      .filter(d => d.date <= last.date)
      .reduce((sum, d) => sum + (d.quantity ?? 0), 0)

    return {
      received,
      onHand: last.on_hand,
      onHandDate: last.date,
      used: Math.max(0, receivedByThen - (last.on_hand ?? 0)),
    }
  }

  function handleSave() {
    setMessage(''); setError('')
    const rows = locationItems.map(i => {
      const raw = valueFor(i.id).trim()
      const n = raw === '' ? null : Number(raw)
      return { item_id: i.id, quantity: raw === '' || Number.isNaN(n!) ? null : n }
    })
    startTransition(async () => {
      const r = await saveDeliveries(settings.year, date, rows)
      if (r.ok) { setDraft({}); setMessage('Deliveries saved.') }
      else setError(r.error)
    })
  }

  const shortDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">Total Inventory</h1>
        <p className="text-sm text-gray-500 mt-1">
          Everything that has come in, and what it has come to. Separate from the Product Sheet
          on purpose.
        </p>
      </div>

      {/* This is the whole reason the screen exists separately, so it says so
          rather than relying on remembering which tab is which. */}
      <div className="mb-4 px-4 py-3 rounded-lg bg-gray-900 text-white text-sm flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-white/20">Internal</span>
        <span>
          Don&apos;t photograph this one. The warehouse gets the <strong>Product Sheet</strong>,
          which shows what&apos;s left and nothing else.
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {LOCATIONS.map(loc => (
            <button
              key={loc}
              onClick={() => { setLocation(loc); setMessage('') }}
              className={`px-4 py-2.5 min-h-[44px] rounded-md text-sm font-semibold transition active:scale-95 ${
                location === loc ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {LOCATION_LABELS[loc]}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Delivery date</label>
          <select
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {allDates.map(dd => (
              <option key={dd} value={dd}>
                {new Date(dd + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                })}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={pending || locationItems.length === 0}
          className="ml-auto px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition"
        >
          {pending ? 'Saving…' : 'Save deliveries'}
        </button>
      </div>

      {message && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <div className="font-semibold mb-0.5">Not saved</div>
          {error}
        </div>
      )}

      {locationItems.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          <div className="font-semibold mb-1">No products for {LOCATION_LABELS[location]} yet.</div>
          The list is shared with the{' '}
          <Link href="/dashboard/products" className="font-semibold underline">Product Sheet</Link> —
          set it up there and it appears here too.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2 text-left font-semibold text-gray-400 w-8">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Product</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-900 w-32">
                    Delivered {shortDate(date)}
                  </th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-500 w-28">Received total</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-500 w-28">Last count</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-500 w-24">Used</th>
                </tr>
              </thead>
              <tbody>
                {locationItems.map((item, i) => {
                  const t = totalsFor(item.id)
                  // What's typed but unsaved still shows in the total, so the
                  // running number reacts as you enter the morning's delivery.
                  const typed = valueFor(item.id).trim()
                  const typedNum = typed === '' ? null : Number(typed)
                  const savedToday = deliveredOn(item.id, date) ?? 0
                  const projected =
                    typedNum == null || Number.isNaN(typedNum)
                      ? t.received
                      : t.received - savedToday + typedNum

                  return (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-1.5 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium text-gray-900">
                        {item.name}
                        {item.unit && <span className="text-xs text-gray-400 font-normal ml-1.5">/ {item.unit}</span>}
                      </td>
                      <td className="px-3 py-1">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={valueFor(item.id)}
                          onChange={e => setValue(item.id, e.target.value)}
                          className="w-full text-center text-base font-bold border border-gray-200 rounded-lg px-1 py-1 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className="text-base font-bold text-gray-900 tabular-nums">{projected}</span>
                      </td>
                      <td className="px-3 py-1.5 text-center tabular-nums">
                        {t.onHand == null ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <>
                            <span className="text-gray-900">{t.onHand}</span>
                            <span className="block text-[10px] text-gray-400">{shortDate(t.onHandDate!)}</span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center tabular-nums">
                        {t.used == null ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className="text-gray-600">{t.used}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500">
            <strong>Received total</strong> is every delivery including the opening stock — 20 to
            start plus 10 the next morning is 30, whatever is on the shelf now.{' '}
            <strong>Used</strong> is measured against the last count, so a delivery that arrived
            after it isn&apos;t reported as eaten.
          </div>
        </div>
      )}
    </div>
  )
}
