'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getAuthHeader } from '@/utils/auth-header'

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
        const defaultCatName = formData.type === 'to_pay' ? 'Préstamos Otorgados' : 'Préstamos Recibidos';
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
    revalidatePath('/', 'layout')
    return { success: true }
}

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';

export async function createDebt(formData: FormData) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    const data = {
        description: formData.get('description'),
        total_amount: parseFloat(formData.get('total_amount') as string),
        remaining_amount: parseFloat(formData.get('total_amount') as string),
        type: formData.get('type'),
        category_id: formData.get('category_id') || null,
        account_id: formData.get('account_id') || null,
        due_date: formData.get('due_date') || null
    };

    // Auto-assign category for Loans if not provided
    if (!data.category_id) {
        const supabase = await createClient();
        const defaultCatName = data.type === 'to_pay' ? 'Préstamos Otorgados' : 'Préstamos Recibidos';

        // Try to find the default category
        const { data: defaultCat } = await supabase
            .from('categories')
            .select('id')
            .eq('name', defaultCatName)
            .eq('is_default', true)
            .single();

        if (defaultCat) {
            data.category_id = defaultCat.id;
        } else {
            // Fallback: Check if it exists as non-default or creating it might be too much for this simple action, 
            // but payDebt does strict checking. Let's try to find any category with that name.
            const { data: anyCat } = await supabase
                .from('categories')
                .select('id')
                .eq('name', defaultCatName)
                .single();

            if (anyCat) data.category_id = anyCat.id;
        }
    }

    const res = await fetch(`${NEXT_PUBLIC_API_URL}/debts/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        console.error('Failed to create debt', await res.text());
        throw new Error('Failed to create debt');
    }

    revalidatePath('/debts')
    revalidatePath('/', 'layout')
}

export async function deleteDebt(debtId: string) {
    const headers = await getAuthHeader()
    if (!headers) redirect('/login')

    const res = await fetch(`${NEXT_PUBLIC_API_URL}/debts/${debtId}`, {
        method: 'DELETE',
        headers
    });

    if (!res.ok) {
        console.error('Failed to delete debt', await res.text());
        throw new Error('Failed to delete debt');
    }

    revalidatePath('/debts')
    revalidatePath('/', 'layout')
}
