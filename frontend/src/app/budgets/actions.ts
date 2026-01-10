'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuthHeader } from '@/utils/auth-header';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';

export async function createBudget(formData: FormData) {
    const headers = await getAuthHeader();
    if (!headers) redirect('/login');

    const data = {
        category_id: formData.get('category_id') || null,
        amount: parseFloat(formData.get('amount') as string),
        period: formData.get('period') as string,
        month: formData.get('month') ? parseInt(formData.get('month') as string) : null,
        year: formData.get('year') ? parseInt(formData.get('year') as string) : new Date().getFullYear(),
        start_date: formData.get('start_date'),
        end_date: formData.get('end_date'),
        user_id: formData.get('user_id') === 'null' ? null : formData.get('user_id')
    };

    const res = await fetch(`${API_URL}/budgets/`, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error('Failed to create budget', errorText);
        throw new Error('Failed to create budget');
    }

    revalidatePath('/', 'layout');
}

export async function deleteBudget(budgetId: string) {
    const headers = await getAuthHeader();
    if (!headers) redirect('/login');

    const res = await fetch(`${API_URL}/budgets/${budgetId}`, {
        method: 'DELETE',
        headers,
    });

    if (!res.ok) {
        console.error('Failed to delete budget', await res.text());
        throw new Error('Failed to delete budget');
    }

    revalidatePath('/', 'layout');
}
