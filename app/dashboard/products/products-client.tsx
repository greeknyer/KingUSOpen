'use client'

import { useState, useTransition } from 'react'
import {
  TournamentSettings, InventoryItem, InventoryCount, Location,
  LOCATION_LABELS, PRODUCT_SHEET_SIZE, getTournamentDates,
} from '@/lib/types'
import { saveItems, saveCounts, clearDay } from './actions'

const LOCATIONS: Location[] = ['food_village', 'stadium']

/** A row being edited in the item list. `id` absent means it's new. */
type DraftItem = { id?: string; name: string; unit: string }

export default function ProductsClient({
  settings,
  items,
  counts,
}: {
  settings: TournamentSettings
  items: InventoryItem[]
  counts: InventoryCount[]
}) {
  const { allDates } = getTournamentDates(settings)
  const today = new Date().toISOString().split('T')[0]
  // Today when the tournament is running, otherwise its first day. Falling back
  // to the LAST day meant opening the screen months beforehand and landing on
  // the final Sunday, which reads as a bug because nothing is on it.
  const defaultDate = allDates.includes(today) ? today : (allDates[0] ?? today)

  const [location, setLocation] = useState<Location>('food_village')
  const [date, setDate] = useState(defaultDate)
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const locationItems = items.filter(i => i.location === location && i.active)

  // Counts live in local state so the whole sheet is one save rather than a
  // round trip per box — this gets filled in standing at the stand.
  const countMap = new Map(counts.filter(c => c.date === date).map(c => [c.item_id, c]))
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({})

  /** The value in a box: what's been typed, else what's saved, else blank. */
  function valueFor(itemId: string): string {
    const key = `${date}:${itemId}`
    if (key in draftCounts) return draftCounts[key]
    const saved = countMap.get(itemId)?.on_hand
    return saved == null ? '' : String(saved)
  }

  function setValue(itemId: string, v: string) {
    setDraftCounts(prev => ({ ...prev, [`${date}:${itemId}`]: v }))
    setMessage('')
  }

  const countedNow = locationItems.filter(i => valueFor(i.id) !== '').length
  const expected = PRODUCT_SHEET_SIZE[location]

  function handleSaveCounts() {
    setMessage(''); setError('')
    const rows = locationItems.map(i => {
      const raw = valueFor(i.id).trim()
      const n = raw === '' ? null : Number(raw)
      return { item_id: i.id, on_hand: raw === '' || Number.isNaN(n!) ? null : n }
    })
    startTransition(async () => {
      const r = await saveCounts(settings.year, date, rows)
      if (r.ok) { setDraftCounts({}); setMessage('Sheet saved.') }
      else setError(r.error)
    })
  }

  function handleClearDay() {
    if (!confirm(`Clear every count on this sheet for ${date}?`)) return
    setMessage(''); setError('')
    startTransition(async () => {
      const r = await clearDay(date, locationItems.map(i => i.id))
      if (r.ok) { setDraftCounts({}); setMessage('Sheet cleared.') }
      else setError(r.error)
    })
  }

  // ── The item list editor ────────────────────────────────────────
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [bulk, setBulk] = useState('')

  function startEditing() {
    setDraftItems(locationItems.map(i => ({ id: i.id, name: i.name, unit: i.unit ?? '' })))
    setBulk('')
    setEditing(true)
    setMessage(''); setError('')
  }

  function updateDraft(index: number, patch: Partial<DraftItem>) {
    setDraftItems(prev => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  function move(index: number, by: number) {
    setDraftItems(prev => {
      const next = [...prev]
      const to = index + by
      if (to < 0 || to >= next.length) return prev
      ;[next[index], next[to]] = [next[to], next[index]]
      return next
    })
  }

  /** One product per line, so a list can be pasted straight in. */
  function addBulk() {
    const lines = bulk.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setDraftItems(prev => [...prev, ...lines.map(name => ({ name, unit: '' }))])
    setBulk('')
  }

  function handleSaveItems() {
    setMessage(''); setError('')
    const cleaned = draftItems
      .map(d => ({ ...d, name: d.name.trim() }))
      .filter(d => d.name !== '')
    startTransition(async () => {
      const r = await saveItems(
        settings.year,
        location,
        cleaned.map((d, i) => ({ id: d.id, name: d.name, unit: d.unit.trim() || null, sort_order: i }))
      )
      if (r.ok) { setEditing(false); setMessage('Product list saved.') }
      else setError(r.error)
    })
  }

  const d = new Date(date + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div>
      <div className="mb-3 no-print">
        <h1 className="text-2xl font-bold text-gray-900">Product Sheet</h1>
        <p className="text-sm text-gray-500 mt-1">
          What&apos;s left at the end of the day, so the warehouse knows what to send tomorrow.
          Photograph the sheet below and send it.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-3 no-print">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {LOCATIONS.map(loc => (
            <button
              key={loc}
              onClick={() => { setLocation(loc); setEditing(false); setMessage('') }}
              className={`px-4 py-2.5 min-h-[44px] rounded-md text-sm font-semibold transition active:scale-95 ${
                location === loc ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {LOCATION_LABELS[loc]}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
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

        <div className="flex gap-2 ml-auto">
          {!editing && (
            <>
              <button
                onClick={handleSaveCounts}
                disabled={pending || locationItems.length === 0}
                className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition"
              >
                {pending ? 'Saving…' : 'Save sheet'}
              </button>
              <button
                onClick={startEditing}
                disabled={pending}
                className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 active:bg-gray-100 transition"
              >
                Edit products
              </button>
              {countedNow > 0 && (
                <button
                  onClick={handleClearDay}
                  disabled={pending}
                  className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-500 text-sm font-semibold rounded-lg hover:bg-gray-50 active:bg-gray-100 transition"
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {message && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 no-print">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 no-print">
          <div className="font-semibold mb-0.5">Not saved</div>
          {error}
        </div>
      )}

      {editing ? (
        /* ── Product list editor ─────────────────────────────────── */
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                {LOCATION_LABELS[location]} products
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                In counting order — the order you walk the stand, so the sheet matches the
                shelves. {draftItems.length} of {expected} expected.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveItems}
                disabled={pending}
                className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition"
              >
                {pending ? 'Saving…' : 'Save products'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 active:bg-gray-100 transition"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="space-y-1.5 mb-5">
            {draftItems.map((item, i) => (
              <div key={item.id ?? `new-${i}`} className="flex items-center gap-2">
                <span className="w-7 text-right text-xs text-gray-400 tabular-nums">{i + 1}</span>
                <input
                  value={item.name}
                  onChange={e => updateDraft(i, { name: e.target.value })}
                  placeholder="Product name"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <input
                  value={item.unit}
                  onChange={e => updateDraft(i, { unit: e.target.value })}
                  placeholder="unit"
                  className="w-24 border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button onClick={() => move(i, -1)} aria-label="Move up"
                  className="w-11 h-11 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 active:bg-gray-100">↑</button>
                <button onClick={() => move(i, 1)} aria-label="Move down"
                  className="w-11 h-11 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 active:bg-gray-100">↓</button>
                <button
                  onClick={() => setDraftItems(prev => prev.filter((_, x) => x !== i))}
                  aria-label="Remove"
                  className="w-11 h-11 rounded-lg border border-gray-200 text-red-400 hover:bg-red-50 active:bg-red-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setDraftItems(prev => [...prev, { name: '', unit: '' }])}
            className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 active:bg-gray-100 transition mb-5"
          >
            + Add a product
          </button>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">
              Or paste the whole list, one product per line
            </label>
            <textarea
              value={bulk}
              onChange={e => setBulk(e.target.value)}
              rows={5}
              placeholder={'Pita\nChicken\nLamb\n…'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              onClick={addBulk}
              disabled={bulk.trim() === ''}
              className="mt-2 px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 transition"
            >
              Add these to the list
            </button>
            <p className="text-xs text-gray-400 mt-2">
              Renaming or reordering keeps every count already taken. Removing a product removes
              its counts too.
            </p>
          </div>
        </div>
      ) : locationItems.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          <div className="font-semibold mb-1">No products for {LOCATION_LABELS[location]} yet.</div>
          Press <strong>Edit products</strong> and paste the list — {expected} of them for this
          stand. You only do this once for the tournament.
        </div>
      ) : (
        /* ── The sheet ───────────────────────────────────────────── */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-base font-bold text-gray-900">
                {LOCATION_LABELS[location]} — on hand
              </div>
              <div className="text-xs text-gray-500">{dateLabel}</div>
            </div>
            <div className={`text-sm font-semibold no-print ${
              countedNow === locationItems.length ? 'text-emerald-600' : 'text-gray-400'
            }`}>
              {countedNow} of {locationItems.length} counted
              {locationItems.length !== expected && (
                <span className="ml-2 text-amber-600">({expected} expected)</span>
              )}
            </div>
          </div>

          {/* Three columns on a wide screen, so 36 lines are 12 rows and the
              whole sheet is one photograph rather than two or three.

              CSS columns rather than a grid: content flows DOWN each column
              before moving across, so the numbering reads 1-12, 13-24, 25-36
              like a printed list. A grid would run 1,2,3 across each row, which
              is not how anyone reads a numbered sheet. */}
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-0 [column-rule:1px_solid_#f3f4f6]">
            {locationItems.map((item, i) => (
              <div
                key={item.id}
                // Nothing may straddle a column break, or a row would be cut in
                // half down the middle of the picture.
                className="break-inside-avoid flex items-center gap-2 px-3 py-0.5 border-b border-gray-100"
              >
                <span className="w-6 text-right text-xs text-gray-400 tabular-nums shrink-0">{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-gray-900 leading-tight">
                  {item.name}
                  {item.unit && <span className="text-[11px] text-gray-400 font-normal ml-1"> / {item.unit}</span>}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={valueFor(item.id)}
                  onChange={e => setValue(item.id, e.target.value)}
                  // Still a 44px tap target, with the padding around it taken
                  // out instead — that is what buys the rows back.
                  className="w-16 shrink-0 text-center text-base font-bold border border-gray-200 rounded-lg px-1 py-1 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            ))}
          </div>

          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 no-print">
            A blank box means not counted, which is not the same as a counted zero. Save before
            photographing if you want the sheet kept.
          </div>
        </div>
      )}
    </div>
  )
}
