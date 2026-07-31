'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { SKILLS, Skill } from '@/lib/types'

/**
 * Skills arrive as repeated `skills` checkbox values. Filtered against the
 * known list so a tampered form can't write a value the CHECK constraint
 * would reject.
 */
function readSkills(formData: FormData): Skill[] {
  const valid = new Set<string>(SKILLS.map(s => s.id))
  return formData
    .getAll('skills')
    .map(String)
    .filter((s): s is Skill => valid.has(s))
}

export async function addEmployee(formData: FormData) {
  const supabase = await createClient()
  await supabase.from('employees').insert({
    name: formData.get('name') as string,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    is_manager: formData.get('is_manager') === 'on',
    skills: readSkills(formData),
  })
  revalidatePath('/dashboard/employees')
  revalidatePath('/dashboard/schedule')
}

export async function updateEmployee(id: string, formData: FormData) {
  const supabase = await createClient()
  await supabase.from('employees').update({
    name: formData.get('name') as string,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    is_manager: formData.get('is_manager') === 'on',
    skills: readSkills(formData),
  }).eq('id', id)
  revalidatePath('/dashboard/employees')
  revalidatePath('/dashboard/schedule')
}

export async function toggleEmployeeActive(id: string, active: boolean) {
  const supabase = await createClient()
  await supabase.from('employees').update({ active }).eq('id', id)
  revalidatePath('/dashboard/employees')
  revalidatePath('/dashboard/schedule')
}
