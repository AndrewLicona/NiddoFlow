'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getWeekNumber, getIsoYear } from '@/utils/date'

/**
 * Siembra datos de prueba.
 *
 * IMPORTANTE: esta funcion **borra** los movimientos, presupuestos, deudas y
 * cuentas de la familia antes de crear los datos de ejemplo. Por eso exige
 * dos cosas:
 *
 *  1. La variable de entorno `ALLOW_SEED_DATA=true` (en el servidor).
 *     Sin ella, la funcion no hace nada.
 *  2. El argumento `confirm` con el texto `BORRAR_Y_SEMBRAR`. Sin ese texto
 *     exacto, tampoco hace nada.
 *
 * De este modo no se puede borrar informacion real por accidente.
 */
export async function seedTestData(confirm?: string) {
    if (process.env.ALLOW_SEED_DATA !== 'true') {
        console.warn('seedTestData omitido: falta ALLOW_SEED_DATA=true en el entorno.')
        return
    }

    if (confirm !== 'BORRAR_Y_SEMBRAR') {
        console.warn('seedTestData omitido: falta la confirmacion "BORRAR_Y_SEMBRAR".')
        return
    }

    const supabase = await createClient()

    // 1. Get User and Family ID
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', session.user.id)
        .single()

    if (!profile?.family_id) return

    const familyId = profile.family_id
    const userId = session.user.id
    const today = new Date()

    // 2. Clear existing clean slate
    await supabase.from('transactions').delete().eq('family_id', familyId)
    await supabase.from('budgets').delete().eq('family_id', familyId)
    await supabase.from('debts').delete().eq('family_id', familyId)
    await supabase.from('accounts').delete().eq('family_id', familyId)

    // 3. Create Accounts
    const { data: accounts, error: accError } = await supabase.from('accounts').insert([
        {
            name: 'Principal (Personal)',
            type: 'personal',
            family_id: familyId,
            user_id: userId,
            balance: 5000000
        },
        {
            name: 'Ahorros Familiares',
            type: 'joint',
            family_id: familyId,
            balance: 15000000
        }
    ]).select()

    if (accError || !accounts) return

    const personalAcc = accounts.find(a => a.type === 'personal')!
    const jointAcc = accounts.find(a => a.type === 'joint')!

    // 4. Get categories
    const { data: categories } = await supabase.from('categories').select('id, name, type')
    if (!categories || categories.length === 0) return

    const incomeCats = categories.filter(c => c.type === 'income')
    const expenseCats = categories.filter(c => c.type === 'expense')

    // 5. Generate data for the last 4 months
    for (let i = 0; i < 4; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const m = d.getMonth() + 1
        const y = d.getFullYear()

        // Create Monthly Budgets (Mixed)
        const monthlyBudgets = expenseCats.slice(0, 3).map(cat => ({
            family_id: familyId,
            category_id: cat.id,
            amount: Math.floor(Math.random() * (800000 - 400000) + 400000),
            period: 'monthly',
            month: m,
            year: y
        }))
        await supabase.from('budgets').insert(monthlyBudgets)

        // Create Weekly Budgets for the CURRENT MONTH if we are in it
        if (i === 0) {
            const currentWeek = getWeekNumber(today)
            // Año ISO: puede diferir del año calendario en enero.
            const currentIsoYear = getIsoYear(today)
            const weeklyBudgets = expenseCats.slice(3, 5).map(cat => ({
                family_id: familyId,
                category_id: cat.id,
                amount: Math.floor(Math.random() * (150000 - 50000) + 50000),
                period: 'weekly',
                week_number: currentWeek,
                year: currentIsoYear
            }))
            await supabase.from('budgets').insert(weeklyBudgets)
        }

        // Create diverse transactions
        const monthlyTxs = []
        for (let j = 0; j < 2; j++) {
            monthlyTxs.push({
                family_id: familyId,
                user_id: userId,
                account_id: personalAcc.id,
                category_id: incomeCats[Math.floor(Math.random() * incomeCats.length)].id,
                amount: Math.floor(Math.random() * (5000000 - 3000000) + 3000000),
                description: `Salario Mes ${m}`,
                type: 'income',
                date: new Date(y, m - 1, Math.floor(Math.random() * 5) + 1).toISOString()
            })
        }

        for (let j = 0; j < 15; j++) {
            const cat = expenseCats[Math.floor(Math.random() * expenseCats.length)]
            const targetAcc = Math.random() > 0.4 ? personalAcc : jointAcc
            monthlyTxs.push({
                family_id: familyId,
                user_id: userId,
                account_id: targetAcc.id,
                category_id: cat.id,
                amount: Math.floor(Math.random() * (150000 - 10000) + 10000),
                description: `Gasto en ${cat.name}`,
                type: 'expense',
                date: new Date(y, m - 1, Math.floor(Math.random() * 25) + 2).toISOString()
            })
        }
        await supabase.from('transactions').insert(monthlyTxs)
    }

    // 6. Insert active Debts
    const debts = [
        {
            family_id: familyId,
            description: 'Préstamo Bancario',
            amount: 12000000,
            remaining_amount: 4500000,
            type: 'to_pay',
            status: 'active',
            due_date: new Date(today.getFullYear(), today.getMonth() + 1, 15).toISOString()
        },
        {
            family_id: familyId,
            description: 'Deuda de Juan',
            amount: 500000,
            remaining_amount: 500000,
            type: 'to_receive',
            status: 'active',
            due_date: new Date(today.getFullYear(), today.getMonth(), 28).toISOString()
        }
    ]
    await supabase.from('debts').insert(debts)

    revalidatePath('/')
}
