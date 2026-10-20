import { startOfMonth, subMonths, endOfMonth, isWithinInterval, parseISO } from 'date-fns'

export interface Transaction {
    id: string
    amount: number
    type: 'income' | 'expense' | 'transfer'
    date: string
    categories?: { name: string } | null
    description?: string
}

export interface Budget {
    id: string
    amount: number
    categories?: { name: string } | null
    spent: number
    percent: number
}

export interface Insight {
    id: string
    type: 'success' | 'warning' | 'info' | 'neutral'
    message: string
    metric?: string
    icon?: string // Lucide icon name hint
}

export function generateInsights(transactions: Transaction[], budgets: Budget[] = [], now: Date = new Date()): Insight[] {
    const insights: Insight[] = [];

    const currentMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Filters
    const currentMonthExpenses = transactions.filter(t => parseISO(t.date) >= currentMonthStart && t.type === 'expense');
    const currentMonthIncome = transactions.filter(t => parseISO(t.date) >= currentMonthStart && t.type === 'income');
    const lastMonthExpenses = transactions.filter(t => isWithinInterval(parseISO(t.date), { start: lastMonthStart, end: lastMonthEnd }) && t.type === 'expense');

    // Total expenses across ALL transactions loaded if month has few
    const totalExpensesAll = transactions.filter(t => t.type === 'expense');
    const totalIncomeAll = transactions.filter(t => t.type === 'income');

    const currentTotalExpense = currentMonthExpenses.length > 0 ? currentMonthExpenses.reduce((acc, t) => acc + Number(t.amount), 0) : totalExpensesAll.reduce((acc, t) => acc + Number(t.amount), 0);
    const currentTotalIncome = currentMonthIncome.length > 0 ? currentMonthIncome.reduce((acc, t) => acc + Number(t.amount), 0) : totalIncomeAll.reduce((acc, t) => acc + Number(t.amount), 0);
    const lastTotalExpense = lastMonthExpenses.reduce((acc, t) => acc + Number(t.amount), 0);

    // 1. Total Spend Comparison (MoM) or general activity
    if (lastTotalExpense > 0) {
        const percentChange = ((currentTotalExpense - lastTotalExpense) / lastTotalExpense) * 100;

        if (currentTotalExpense > lastTotalExpense) {
            insights.push({
                id: 'mom-spend-higher',
                type: 'warning',
                message: `Has gastado un ${percentChange.toFixed(0)}% más que el mes pasado completo.`,
                metric: 'Gastos al alza',
                icon: 'TrendingUp'
            });
        } else if (currentTotalExpense < lastTotalExpense) {
            insights.push({
                id: 'mom-spend-lower',
                type: 'success',
                message: `Vas por buen camino. Has gastado un ${Math.abs(percentChange).toFixed(0)}% menos que el mes pasado.`,
                metric: 'Ahorro potencial',
                icon: 'TrendingDown'
            });
        }
    }

    // 2. Savings Rate
    if (currentTotalIncome > 0) {
        const savingsRate = ((currentTotalIncome - currentTotalExpense) / currentTotalIncome) * 100;
        if (savingsRate > 0) {
            insights.push({
                id: 'savings-rate',
                type: 'success',
                message: `Tasa de ahorro actual del ${savingsRate.toFixed(0)}% sobre tus ingresos registrados.`,
                metric: 'Salud Financiera',
                icon: 'PiggyBank'
            });
        }
    }

    // 3. Top Category
    const categoryTotals: Record<string, number> = {};
    const activeExpenses = currentMonthExpenses.length > 0 ? currentMonthExpenses : totalExpensesAll;
    activeExpenses.forEach(t => {
        const cat = t.categories?.name || 'Otros';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(t.amount);
    });

    let topCat = '';
    let topAmount = 0;
    Object.entries(categoryTotals).forEach(([cat, amount]) => {
        if (amount > topAmount) {
            topAmount = amount;
            topCat = cat;
        }
    });

    if (topCat) {
        insights.push({
            id: 'top-cat',
            type: 'neutral',
            message: `Mayor gasto registrado en ${topCat}.`,
            metric: `$${topAmount.toLocaleString('es-CO')}`,
            icon: 'PieChart'
        });
    }

    // 4. Activity check - if we have transactions at all, add a summary insight
    if (transactions.length > 0) {
        insights.push({
            id: 'general-summary',
            type: 'info',
            message: `Analizando ${transactions.length} movimientos recientes en tus cuentas.`,
            metric: 'Actividad',
            icon: 'Activity'
        });
    }

    if (insights.length === 0) {
        insights.push({
            id: 'welcome',
            type: 'info',
            message: 'Registra tus primeros movimientos para ver análisis detallados.',
            icon: 'Sparkles'
        });
    }

    return insights.slice(0, 4);
}
