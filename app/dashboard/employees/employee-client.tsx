'use client'

import { useState, useTransition } from 'react'
import { Employee, SKILLS, Skill } from '@/lib/types'
import { addEmployee, updateEmployee, toggleEmployeeActive } from './actions'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md my-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 text-2xl leading-none">×</button>
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
        <label className="block text-sm font-semibold text-gray-500 mb-1.5">Name *</label>
        <input name="name" defaultValue={employee?.name} required
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Email</label>
          <input name="email" type="email" defaultValue={employee?.email ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Phone</label>
          <input name="phone" defaultValue={employee?.phone ?? ''}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-500 mb-1.5">
          Can work these positions *
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Auto-Schedule only places someone in a position they&apos;re ticked for.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SKILLS.map(s => (
            <label
              key={s.id}
              className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition"
            >
              <input
                type="checkbox"
                name="skills"
                value={s.id}
                defaultChecked={employee?.skills?.includes(s.id) ?? false}
                className="w-5 h-5 accent-gray-900"
              />
              <span className="text-sm text-gray-700">{s.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition">
          <input
            type="checkbox"
            name="is_manager"
            defaultChecked={employee?.is_manager ?? false}
            className="w-5 h-5 accent-purple-600"
          />
          <span className="text-sm text-gray-700">
            Manager <span className="text-gray-400">— gets the MGR badge and is preferred for Chef</span>
          </span>
        </label>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={pending}
          className="flex-1 bg-gray-900 text-white text-sm font-semibold rounded-lg py-3 min-h-[48px] hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition">
          {pending ? 'Saving…' : employee ? 'Save Changes' : 'Add Employee'}
        </button>
        <button type="button" onClick={onClose}
          className="px-4 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg py-3 min-h-[48px] hover:bg-gray-50 active:bg-gray-100 transition">
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
              className={`px-4 py-2.5 min-h-[44px] rounded-md text-sm font-semibold transition active:scale-95 ${filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-5 py-2.5 min-h-[44px] bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-700 transition">
          + Add Employee
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Can work</th>
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
                  <div className="flex flex-wrap gap-1 items-center">
                    {emp.is_manager && (
                      <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-purple-100 text-purple-700">MGR</span>
                    )}
                    {(emp.skills ?? []).length === 0 ? (
                      <span className="text-xs text-amber-600">No positions set</span>
                    ) : (
                      SKILLS.filter(s => emp.skills?.includes(s.id)).map(s => (
                        <span key={s.id} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                          {s.label}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-xs text-gray-500">
                  {emp.email && <div>{emp.email}</div>}
                  {emp.phone && <div>{emp.phone}</div>}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(emp)}
                      className="text-sm text-gray-500 hover:text-gray-900 font-medium transition px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200">
                      Edit
                    </button>
                    <button onClick={() => handleToggle(emp)} disabled={pending}
                      className={`text-sm font-medium transition px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200 ${emp.active ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'}`}>
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
