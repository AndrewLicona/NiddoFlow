'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function payDebt(formData: {
    debtId: string;
    accountId: string;
    categoryId: string;
    amount: number;
    description: string;
    type: 'to_pay' | 'to_receive';
    receiptUrl?: string | null;
}) {
    const supabase = await createClient()

    // 1. Get Session and Family
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No session')

    const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', session.user.id)
        .single()

    if (!profile?.family_id) throw new Error('No family')

    // 2. Start an informal transaction (sequential updates)
    // In a real app, use a RPC or a database function for atomicity

    // A. Create Transaction
    let effectiveCategoryId = formData.categoryId;
    if (!effectiveCategoryId) {
        const defaultCatName = formData.type === 'to_pay' ? 'Pagos de Deuda' : 'Cobros de Deuda';
        const { data: defaultCat } = await supabase
            .from('categories')
            .select('id')
            .eq('name', defaultCatName)
            .eq('is_default', true)
            .single();

        if (defaultCat) {
            effectiveCategoryId = defaultCat.id;
        }
    }

    const { error: txError } = await supabase.from('transactions').insert({
        family_id: profile.family_id,
        user_id: session.user.id,
        account_id: formData.accountId,
        category_id: effectiveCategoryId || null,
        description: `[${formData.type === 'to_pay' ? 'PAGO DEUDA' : 'COBRO DEUDA'}] ${formData.description}`,
        amount: formData.amount,
        type: formData.type === 'to_pay' ? 'expense' : 'income',
        date: new Date().toISOString(),
        receipt_url: formData.receiptUrl || null
    }).select().single()

    if (txError) throw txError

    // B. Update Account Balance
    // We fetch current balance first
    const { data: account } = await supabase.from('accounts').select('balance').eq('id', formData.accountId).single()
    if (account) {
        const newBalance = formData.type === 'to_pay'
            ? Number(account.balance) - formData.amount
            : Number(account.balance) + formData.amount

        await supabase.from('accounts').update({ balance: newBalance }).eq('id', formData.accountId)
    }

    // C. Update Debt Remaining Amount
    const { data: debt } = await supabase.from('debts').select('remaining_amount, status').eq('id', formData.debtId).single()
    if (debt) {
        const newRemaining = Math.max(0, Number(debt.remaining_amount) - formData.amount)
        const newStatus = newRemaining <= 0 ? 'paid' : 'active'

        await supabase.from('debts').update({
            remaining_amount: newRemaining,
            status: newStatus
        }).eq('id', formData.debtId)
    }

    revalidatePath('/debts')
    revalidatePath('/')
    return { success: true }
}
