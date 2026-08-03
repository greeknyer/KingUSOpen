import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import InventoryClient from './inventory-client'
import { getTournamentDates, InventoryItem, InventoryCount, InventoryDelivery } from '@/lib/types'

export default async function InventoryPage() {
  const supabase = await createClient()

  // Asked of the database, which is also what enforces it — hiding the tab
  // alone would leave the numbers one API request away for any signed-in user.
  const { data: allowed } = await supabase.rpc('is_inventory_admin')
  if (allowed !== true) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Total Inventory</h1>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-sm text-gray-600">
          <div className="font-semibold text-gray-900 mb-1">Not available for this account.</div>
          Deliveries and totals are limited to named accounts. The{' '}
          <Link href="/dashboard/products" className="font-semibold underline">Product Sheet</Link>{' '}
          is open to everyone.
        </div>
      </div>
    )
  }

  const { data: settingsRows } = await supabase
    .from('tournament_settings')
    .select('*')
    .order('year', { ascending: false })
    .limit(1)
  const settings = settingsRows?.[0]

  if (!settings) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Total Inventory</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          No tournament configured.{' '}
          <Link href="/dashboard/setup" className="font-semibold underline">Go to Setup first.</Link>
        </div>
      </div>
    )
  }

  const { allDates } = getTournamentDates(settings)

  const [
    { data: items, error: itemsError },
    { data: counts, error: countsError },
    { data: deliveries, error: deliveriesError },
  ] = await Promise.all([
    supabase.from('inventory_items').select('*').eq('year', settings.year).order('sort_order'),
    supabase.from('inventory_counts').select('*').in('date', allDates),
    supabase.from('inventory_deliveries').select('*').in('date', allDates),
  ])

  const missing = itemsError ?? countsError ?? deliveriesError
  if (missing) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Total Inventory</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          <div className="font-semibold mb-1">This screen needs a migration first.</div>
          Run <code className="font-mono">020_product_sheet.sql</code> through{' '}
          <code className="font-mono">022_inventory_access.sql</code> from{' '}
          <code className="font-mono">supabase/migrations</code>, then reload. ({missing.message})
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 max-w-full">
      <InventoryClient
        settings={settings}
        items={(items ?? []) as InventoryItem[]}
        counts={(counts ?? []) as InventoryCount[]}
        deliveries={(deliveries ?? []) as InventoryDelivery[]}
      />
    </div>
  )
}
