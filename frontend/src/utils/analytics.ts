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

    // 1. Total Spend Comparison (MoM)
    const currentTotalExpense = currentMonthExpenses.reduce((acc, t) => acc + Number(t.amount), 0);
    const currentTotalIncome = currentMonthIncome.reduce((acc, t) => acc + Number(t.amount), 0);
    const lastTotalExpense = lastMonthExpenses.reduce((acc, t) => acc + Number(t.amount), 0);

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
        } else if (currentTotalExpense < lastTotalExpense && now.getDate() > 20) {
            insights.push({
                id: 'mom-spend-lower',
                type: 'success',
                message: `Vas por buen camino. Has gastado un ${Math.abs(percentChange).toFixed(0)}% menos que el mes pasado.`,
                metric: 'Ahorro potencial',
                icon: 'TrendingDown'
            });
        }
    }

    // 2. Savings Rate (New)
    if (currentTotalIncome > 0) {
        const savingsRate = ((currentTotalIncome - currentTotalExpense) / currentTotalIncome) * 100;
        if (savingsRate > 20) {
            insights.push({
                id: 'savings-rate',
                type: 'success',
                message: `¡Excelente! Estás ahorrando el ${savingsRate.toFixed(0)}% de tus ingresos este mes.`,
                metric: 'Salud Financiera',
                icon: 'PiggyBank'
            });
        }
    }

    // 3. Recurring Payments Detection (New)
    const potentialRecurring = currentMonthExpenses.filter(ct =>
        lastMonthExpenses.some(lt =>
            lt.description === ct.description &&
            Math.abs(lt.amount - ct.amount) < 100 // Tolerance
        )
    );
    if (potentialRecurring.length > 0) {
        insights.push({
            id: 'recurring-detect',
            type: 'info',
            message: `Detectamos ${potentialRecurring.length} pagos recurrentes (ej. ${potentialRecurring[0].description}).`,
            metric: 'Suscripciones',
            icon: 'CalendarClock'
        });
    }

    // 4. Budget Prediction (New)
    if (budgets.length > 0) {
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysPassed = now.getDate();
        const progressMonth = daysPassed / daysInMonth;

        const atRiskBudget = budgets.find(b => {
            const progressBudget = b.spent / b.amount;
            return (progressBudget > progressMonth + 0.2) && b.percent < 100;
        });

        if (atRiskBudget) {
            insights.push({
                id: 'budget-risk',
                type: 'warning',
                message: `Cuidado con ${atRiskBudget.categories?.name || 'la categoría'}. A este ritmo excederás tu presupuesto antes de fin de mes.`,
                metric: 'Proyección',
                icon: 'Activity'
            });
        }
    }

    // 5. Top Category this month
    const categoryTotals: Record<string, number> = {};
    currentMonthExpenses.forEach(t => {
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

    if (topCat && topCat !== 'Otros') {
        insights.push({
            id: 'top-cat',
            type: 'neutral',
            message: `Tu mayor gasto este mes ha sido en ${topCat}.`,
            metric: `$${topAmount.toLocaleString('es-CO')}`,
            icon: 'PieChart'
        });
    }

    // 6. Anomaly Detection (Single large expense)
    if (currentTotalExpense > 0) {
        const largeTx = currentMonthExpenses.find(t => Number(t.amount) > (currentTotalExpense * 0.4));
        if (largeTx) {
            insights.push({
                id: 'anomaly-detect',
                type: 'neutral',
                message: `Notamos un movimiento grande: "${largeTx.description || 'Gasto'}" representa el 40%+ de tus gastos.`,
                icon: 'AlertTriangle'
            });
        }
    }

    if (insights.length === 0) {
        insights.push({
            id: 'welcome',
            type: 'info',
            message: 'Registra más movimientos para obtener análisis detallados.',
            icon: 'Sparkles'
        });
    }

    return insights.slice(0, 4);
}
