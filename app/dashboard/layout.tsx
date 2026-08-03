import Sidebar from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The same check the row-security policy makes, so the menu can't offer a
  // screen the database would refuse.
  const supabase = await createClient()
  const { data: isInventoryAdmin } = await supabase.rpc('is_inventory_admin')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isInventoryAdmin={isInventoryAdmin === true} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
