'use client'

import { useState, useTransition } from 'react'
import { Employee } from '@/lib/types'
import { addEmployee, updateEmployee, toggleEmployeeActive } from './actions'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      if (employee) {
        await updateEmployee(employee.id, fd)
      } else {
        await addEmployee(fd)
      }
      onClose()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
        <input name="name" defaultValue={employee?.name} required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
          <input name="email" type="email" defaultValue={employee?.email ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label>
          <input name="phone" defaultValue={employee?.phone ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Role *</label>
        <select name="role" defaultValue={employee?.role ?? 'crew'} required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
          <option value="crew">Crew</option>
          <option value="manager">Manager</option>
        </select>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={pending}
          className="flex-1 bg-gray-900 text-white text-sm font-semibold rounded-lg py-2.5 hover:bg-gray-800 disabled:opacity-50 transition">
          {pending ? 'Saving…' : employee ? 'Save Changes' : 'Add Employee'}
        </button>
        <button type="button" onClick={onClose}
          className="px-4 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg py-2.5 hover:bg-gray-50 transition">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function EmployeeClient({ employees }: { employees: Employee[] }) {
  const [filter, setFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = employees.filter(e => {
    if (filter === 'active') return e.active
    if (filter === 'inactive') return !e.active
    return true
  })

  function handleToggle(e: Employee) {
    startTransition(() => toggleEmployeeActive(e.id, !e.active))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['active', 'inactive', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition">
          + Add Employee
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Role</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Contact</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="text-center py-12 text-sm text-gray-400">No employees found.</td></tr>
            )}
            {filtered.map(emp => (
              <tr key={emp.id} className="border-t border-gray-50 hover:bg-gray-50 transition">
                <td className="px-5 py-3">
                  <div className="text-sm font-semibold text-gray-900">{emp.name}</div>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                    emp.role === 'manager' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                  }`}>{emp.role}</span>
                </td>
                <td className="px-5 py-3 text-xs text-gray-500">
                  {emp.email && <div>{emp.email}</div>}
                  {emp.phone && <div>{emp.phone}</div>}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(emp)}
                      className="text-xs text-gray-500 hover:text-gray-900 font-medium transition px-2 py-1 rounded hover:bg-gray-100">
                      Edit
                    </button>
                    <button onClick={() => handleToggle(emp)} disabled={pending}
                      className={`text-xs font-medium transition px-2 py-1 rounded hover:bg-gray-100 ${emp.active ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'}`}>
                      {emp.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Add Employee" onClose={() => setShowAdd(false)}>
          <EmployeeForm onClose={() => setShowAdd(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Employee" onClose={() => setEditing(null)}>
          <EmployeeForm employee={editing} onClose={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}
