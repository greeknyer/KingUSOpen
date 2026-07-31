'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addEmployee(formData: FormData) {
  const supabase = await createClient()
  await supabase.from('employees').insert({
    name: formData.get('name') as string,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    role: formData.get('role') as string,
  })
  revalidatePath('/dashboard/employees')
}

export async function updateEmployee(id: string, formData: FormData) {
  const supabase = await createClient()
  await supabase.from('employees').update({
    name: formData.get('name') as string,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    role: formData.get('role') as string,
  }).eq('id', id)
  revalidatePath('/dashboard/employees')
}

export async function toggleEmployeeActive(id: string, active: boolean) {
  const supabase = await createClient()
  await supabase.from('employees').update({ active }).eq('id', id)
  revalidatePath('/dashboard/employees')
}
