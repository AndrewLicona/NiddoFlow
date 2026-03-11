import { createClient } from '@/utils/supabase/server'
import BulkTransactionClient from './BulkTransactionClient'

export const metadata = {
  title: 'Carga Masiva de Transacciones | NiddoFlow',
}

async function getCategories() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const res = await fetch(`${baseUrl}/categories/`, {
    headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {}
  })
  if (!res.ok) return []
  return res.json()
}

async function getAccounts() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const res = await fetch(`${baseUrl}/accounts/?scope=family`, {
    headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {}
  })
  if (!res.ok) return []
  return res.json()
}

export default async function BulkTransactionsPage() {
  const [categories, accounts] = await Promise.all([
    getCategories(),
    getAccounts()
  ])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <BulkTransactionClient categories={categories} accounts={accounts} />
    </div>
  )
}
