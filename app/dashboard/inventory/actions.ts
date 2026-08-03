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
        'The database is missing the deliveries column. Run migration 021 in ' +
        `supabase/migrations, then try again. (${error.message})`,
    }
  }
  return { ok: false, error: error.message }
}

/**
 * Record what arrived on a date.
 *
 * Only `delivered` is sent, never `on_hand`. The two share a row but are
 * entered on different screens at different ends of the day, and an upsert
 * carrying both would let this screen quietly overwrite a count taken at the
 * stand — PostgREST only updates the columns present in the payload.
 */
export async function saveDeliveries(
  year: number,
  date: string,
  rows: { item_id: string; delivered: number | null }[]
): Promise<SaveResult> {
  if (rows.length === 0) return { ok: true }
  const supabase = await createClient()

  const { error } = await supabase.from('inventory_counts').upsert(
    rows.map(r => ({
      year,
      date,
      item_id: r.item_id,
      delivered: r.delivered,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'date,item_id' }
  )
  if (error) return toResult(error)

  revalidatePath('/dashboard/inventory')
  revalidatePath('/dashboard/products')
  return { ok: true }
}
