'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type SaveResult = { ok: true } | { ok: false; error: string }

function toResult(error: { message: string; code?: string } | null): SaveResult {
  if (!error) return { ok: true }
  if (error.code === '42703' || error.code === 'PGRST205' || error.code === '42P01') {
    return {
      ok: false,
      error:
        'The database is missing the product sheet tables. Run migration 020 in ' +
        `supabase/migrations, then try again. (${error.message})`,
    }
  }
  return { ok: false, error: error.message }
}

/**
 * Replace a location's product list.
 *
 * The screen always submits the whole list, so it is rebuilt rather than
 * diffed — but only the names and order are rewritten. Rows keep their ids, so
 * counts already taken against a product survive it being renamed or moved.
 * Deleting a product does take its counts with it, which is the intent: it was
 * never stocked.
 */
export async function saveItems(
  year: number,
  location: string,
  items: { id?: string; name: string; unit: string | null; sort_order: number }[]
): Promise<SaveResult> {
  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('inventory_items')
    .select('id')
    .eq('year', year)
    .eq('location', location)
  if (readError) return toResult(readError)

  const keep = new Set(items.map(i => i.id).filter(Boolean) as string[])
  const removed = (existing ?? []).map(r => r.id).filter(id => !keep.has(id))

  if (removed.length > 0) {
    const { error } = await supabase.from('inventory_items').delete().in('id', removed)
    if (error) return toResult(error)
  }

  const updates = items.filter(i => i.id)
  for (const item of updates) {
    const { error } = await supabase
      .from('inventory_items')
      .update({ name: item.name, unit: item.unit, sort_order: item.sort_order })
      .eq('id', item.id!)
    if (error) return toResult(error)
  }

  const inserts = items
    .filter(i => !i.id)
    .map(i => ({ year, location, name: i.name, unit: i.unit, sort_order: i.sort_order, active: true }))
  if (inserts.length > 0) {
    const { error } = await supabase.from('inventory_items').insert(inserts)
    if (error) return toResult(error)
  }

  revalidatePath('/dashboard/products')
  return { ok: true }
}

/**
 * Save one day's counts for a location.
 *
 * A blank box is stored as NULL rather than zero — "not counted" and "counted
 * none" mean different things to whoever is loading the van in the morning.
 */
export async function saveCounts(
  year: number,
  date: string,
  counts: { item_id: string; on_hand: number | null }[]
): Promise<SaveResult> {
  if (counts.length === 0) return { ok: true }
  const supabase = await createClient()

  const rows = counts.map(c => ({
    year,
    date,
    item_id: c.item_id,
    on_hand: c.on_hand,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('inventory_counts')
    .upsert(rows, { onConflict: 'date,item_id' })
  if (error) return toResult(error)

  revalidatePath('/dashboard/products')
  return { ok: true }
}

/** Clear a day's sheet back to uncounted, for a count started by mistake. */
export async function clearDay(
  date: string,
  itemIds: string[]
): Promise<SaveResult> {
  if (itemIds.length === 0) return { ok: true }
  const supabase = await createClient()
  const { error } = await supabase
    .from('inventory_counts')
    .delete()
    .eq('date', date)
    .in('item_id', itemIds)
  if (error) return toResult(error)
  revalidatePath('/dashboard/products')
  return { ok: true }
}
