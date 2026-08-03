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
 * Whether this account may see deliveries.
 *
 * Asked of the database rather than worked out here, so the answer is the same
 * one the row-security policy uses — a check the app did on its own could drift
 * from the check that actually protects the data.
 */
export async function canSeeInventory(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_inventory_admin')
  if (error) return false
  return data === true
}

/**
 * Record what arrived on a date.
 *
 * Writes to inventory_deliveries, which only accounts listed in app_admins can
 * touch — so this fails at the database for anyone else, not merely at the
 * screen. The counts the product sheet takes are a separate table and are left
 * alone entirely.
 */
export async function saveDeliveries(
  year: number,
  date: string,
  rows: { item_id: string; quantity: number | null }[]
): Promise<SaveResult> {
  if (rows.length === 0) return { ok: true }
  const supabase = await createClient()

  const { error } = await supabase.from('inventory_deliveries').upsert(
    rows.map(r => ({
      year,
      date,
      item_id: r.item_id,
      quantity: r.quantity,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'date,item_id' }
  )
  if (error) return toResult(error)

  revalidatePath('/dashboard/inventory')
  return { ok: true }
}
