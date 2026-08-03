import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ProductsClient from './products-client'
import { getTournamentDates, InventoryItem, InventoryCount } from '@/lib/types'

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data: settingsRows } = await supabase
    .from('tournament_settings')
    .select('*')
    .order('year', { ascending: false })
    .limit(1)
  const settings = settingsRows?.[0]

  if (!settings) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Product Sheet</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          No tournament configured.{' '}
          <Link href="/dashboard/setup" className="font-semibold underline">Go to Setup first.</Link>
        </div>
      </div>
    )
  }

  const { allDates } = getTournamentDates(settings)

  const [{ data: items, error: itemsError }, { data: counts }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('*')
      .eq('year', settings.year)
      .order('sort_order'),
    supabase.from('inventory_counts').select('*').in('date', allDates),
  ])

  // A missing table reads as an empty sheet, which looks like nothing has been
  // set up rather than like a migration that hasn't been run.
  if (itemsError) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Product Sheet</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          <div className="font-semibold mb-1">The product sheet tables aren&apos;t there yet.</div>
          Run <code className="font-mono">020_product_sheet.sql</code> from{' '}
          <code className="font-mono">supabase/migrations</code> in the Supabase SQL Editor, then
          reload. ({itemsError.message})
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-full">
      <ProductsClient
        settings={settings}
        items={(items ?? []) as InventoryItem[]}
        counts={(counts ?? []) as InventoryCount[]}
      />
    </div>
  )
}
