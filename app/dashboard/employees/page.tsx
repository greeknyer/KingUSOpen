import { createClient } from '@/lib/supabase/server'
import EmployeeClient from './employee-client'

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .order('name')

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
        <p className="text-sm text-gray-500 mt-1">Manage staff for the US Open</p>
      </div>
      <EmployeeClient employees={employees ?? []} />
    </div>
  )
}
