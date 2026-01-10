'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import BalanceLineChart from './BalanceLineChart';
import IncomeExpenseBarChart from './IncomeExpenseBarChart';
import CategoryBarChart from './CategoryBarChart';
import ExpensesAreaChart from './ExpensesAreaChart';
import UserExpensesPieChart from './UserExpensesPieChart';
import { PageHeader } from '@/components/ui/molecules/PageHeader';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { ChevronLeft, ChevronRight, X, RotateCcw } from 'lucide-react';

interface Account {
    id: string;
    balance: number;
    type: string;
    name: string;
}

interface Profile {
    id: string;
    full_name: string | null;
}

interface Transaction {
    id: string;
    amount: number;
    user_id?: string;
    user_name?: string;
    category?: string;
    categories?: { name: string } | null;
    date: string;
    type: 'income' | 'expense' | 'transfer';
    description: string;
}

const ChartsPage: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [visibleCharts, setVisibleCharts] = useState<string[]>([
        'balanceLine',
        'incomeExpenseBar',
        'categoryBar',
        'expensesArea',
        'userExpenses',
    ]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            const supabase = createClient();
            const { data: accountsData } = await supabase.from('accounts').select('*');
            const { data: transactionsData } = await supabase
                .from('transactions')
                .select('*, categories(name)');
            const { data: profilesData } = await supabase
                .from('profiles')
                .select('id, full_name');

            setAccounts((accountsData || []) as Account[]);
            setTransactions((transactionsData || []) as Transaction[]);
            setProfiles((profilesData || []) as Profile[]);
        };
        fetchData();
    }, []);

    const removeChart = (id: string) => {
        setVisibleCharts((prev) => prev.filter((c) => c !== id));
    };

    const handleScroll = () => {
        if (scrollRef.current) {
            const index = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
            setActiveIndex(index);
        }
    };

    const scrollTo = (index: number) => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                left: index * scrollRef.current.offsetWidth,
                behavior: 'smooth',
            });
        }
    };

    const chartItems = [
        { id: 'balanceLine', title: 'Balance Acumulado', component: <BalanceLineChart accounts={accounts} transactions={transactions} /> },
        { id: 'incomeExpenseBar', title: 'Flujo de Caja', component: <IncomeExpenseBarChart transactions={transactions} /> },
        { id: 'categoryBar', title: 'Ranking de Gastos', component: <CategoryBarChart transactions={transactions} /> },
        { id: 'expensesArea', title: 'Tendencia de Gastos', component: <ExpensesAreaChart transactions={transactions} /> },
        { id: 'userExpenses', title: 'Gastos por Integrante', component: <UserExpensesPieChart transactions={transactions} profiles={profiles} /> },
    ].filter(item => visibleCharts.includes(item.id));

    return (
        <div className="min-h-screen bg-background flex flex-col pb-24">
            <div className="max-w-5xl mx-auto w-full p-4 md:p-8 space-y-8 flex-1 flex flex-col">
                <PageHeader
                    title="Analítica Visual"
                    description="Explora tus hábitos financieros con gráficos interactivos."
                    backHref="/"
                    actions={
                        <div className="flex space-x-2">
                            {chartItems.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => scrollTo(idx)}
                                    className={`w-2 h-2 rounded-full transition-all duration-300 ${activeIndex === idx ? 'bg-blue-600 w-6' : 'bg-foreground/20'}`}
                                />
                            ))}
                        </div>
                    }
                />

                <main className="flex-1 flex flex-col justify-center relative min-h-[500px]">
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide flex-1"
                    >
                        {chartItems.length > 0 ? (
                            chartItems.map((item) => (
                                <div key={item.id} className="flex-shrink-0 w-full snap-center px-2 md:px-4">
                                    <Card variant="elevated" className="h-full flex flex-col border-foreground/[0.03] shadow-2xl shadow-blue-500/5">
                                        <div className="flex justify-between items-center mb-8">
                                            <div className="space-y-1">
                                                <Typography variant="small" className="text-blue-600 font-bold uppercase tracking-widest text-[10px]">Visualización</Typography>
                                                <Typography variant="h2" className="text-foreground font-black tracking-tight">{item.title}</Typography>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-foreground/30 hover:text-rose-500 transition-colors rounded-full p-2"
                                                onClick={() => removeChart(item.id)}
                                            >
                                                <X size={20} />
                                            </Button>
                                        </div>
                                        <div className="flex-1 min-h-0 bg-foreground/[0.01] rounded-3xl p-4 md:p-8">
                                            {item.component}
                                        </div>
                                    </Card>
                                </div>
                            ))
                        ) : (
                            <div className="w-full flex flex-col items-center justify-center p-12 text-center space-y-6">
                                <div className="p-6 bg-foreground/5 rounded-full text-foreground/20">
                                    <RotateCcw size={48} />
                                </div>
                                <div className="space-y-2">
                                    <Typography variant="h3" className="text-foreground/70 font-black">No hay gráficos visibles</Typography>
                                    <Typography variant="body" className="text-foreground/40">Has ocultado todas las visualizaciones del dashboard.</Typography>
                                </div>
                                <Button
                                    onClick={() => setVisibleCharts(['balanceLine', 'incomeExpenseBar', 'categoryBar', 'expensesArea', 'userExpenses'])}
                                    className="shadow-xl shadow-blue-500/20"
                                >
                                    Restaurar Gráficos
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Navigation Arrows */}
                    {chartItems.length > 1 && (
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none px-4 md:-mx-8">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => scrollTo(activeIndex - 1)}
                                className={`pointer-events-auto h-12 w-12 rounded-full bg-card shadow-2xl border border-foreground/5 text-foreground transition-all flex items-center justify-center ${activeIndex === 0 ? 'opacity-0 scale-90 translate-x-4' : 'opacity-100 scale-100 translate-x-0'}`}
                            >
                                <ChevronLeft size={24} />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => scrollTo(activeIndex + 1)}
                                className={`pointer-events-auto h-12 w-12 rounded-full bg-card shadow-2xl border border-foreground/5 text-foreground transition-all flex items-center justify-center ${activeIndex === chartItems.length - 1 ? 'opacity-0 scale-90 -translate-x-4' : 'opacity-100 scale-100 translate-x-0'}`}
                            >
                                <ChevronRight size={24} />
                            </Button>
                        </div>
                    )}
                </main>

                <footer className="pt-8 text-center">
                    <Typography variant="muted" className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">
                        Desliza o usa las flechas para explorar • NiddoFlow Analytics
                    </Typography>
                </footer>
            </div>

            <style jsx global>{`
                .scrollbar-hide::-webkit-scrollbar {
                  display: none;
                }
                .scrollbar-hide {
                  -ms-overflow-style: none;
                  scrollbar-width: none;
                }
            `}</style>
        </div>
    );
};

export default ChartsPage;
