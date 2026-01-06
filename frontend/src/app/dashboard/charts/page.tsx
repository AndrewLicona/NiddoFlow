// src/app/dashboard/charts/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import BalanceLineChart from './BalanceLineChart';
import IncomeExpenseBarChart from './IncomeExpenseBarChart';
import CategoryBarChart from './CategoryBarChart';
import ExpensesAreaChart from './ExpensesAreaChart';
import UserExpensesPieChart from './UserExpensesPieChart';

// Types for fetched data
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
    user_id: string;
    category: string; // Display name from join
    categories?: { name: string };
    date: string; // ISO string
    type: 'income' | 'expense';
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

    // Fetch data once on mount
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
            setTransactions((transactionsData || []) as any[]);
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
        { id: 'expensesArea', title: 'Tendencia de Gastos (Área)', component: <ExpensesAreaChart transactions={transactions} /> },
        { id: 'userExpenses', title: '¿Quién gasta más? (Por Integrante)', component: <UserExpensesPieChart transactions={transactions} profiles={profiles} /> },
    ].filter(item => visibleCharts.includes(item.id));

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="p-6 bg-white border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center space-x-4">
                    <Link href="/" className="p-2 rounded-full hover:bg-gray-100 transition-colors text-blue-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        Dashboard – Gráficos
                    </h1>
                </div>
                <div className="flex space-x-2">
                    {chartItems.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => scrollTo(idx)}
                            className={`w-3 h-3 rounded-full transition-all ${activeIndex === idx ? 'bg-blue-600 w-6' : 'bg-gray-300'}`}
                        />
                    ))}
                </div>
            </header>

            <main className="flex-1 flex flex-col justify-center overflow-hidden relative">
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide h-[60vh]"
                >
                    {chartItems.length > 0 ? (
                        chartItems.map((item) => (
                            <div key={item.id} className="flex-shrink-0 w-full snap-center px-4 md:px-12">
                                <div className="bg-white rounded-2xl shadow-xl p-8 h-full flex flex-col relative border border-gray-100">
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-xl font-bold text-gray-800">{item.title}</h2>
                                        <button
                                            className="text-gray-400 hover:text-red-500 transition-colors"
                                            onClick={() => removeChart(item.id)}
                                            title="Remover gráfico"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="flex-1 min-h-0">
                                        {item.component}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="w-full flex flex-col items-center justify-center text-gray-500 p-12">
                            <p className="text-lg">No hay gráficos visibles.</p>
                            <button
                                onClick={() => setVisibleCharts(['balanceLine', 'incomeExpenseBar', 'categoryBar', 'expensesArea', 'userExpenses'])}
                                className="mt-4 text-blue-600 hover:underline"
                            >
                                Restaurar todos los gráficos
                            </button>
                        </div>
                    )}
                </div>

                {/* Navigation Arrows */}
                {chartItems.length > 1 && (
                    <>
                        <button
                            onClick={() => scrollTo(activeIndex - 1)}
                            disabled={activeIndex === 0}
                            className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/80 shadow-lg hover:bg-white transition-all ${activeIndex === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <button
                            onClick={() => scrollTo(activeIndex + 1)}
                            disabled={activeIndex === chartItems.length - 1}
                            className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/80 shadow-lg hover:bg-white transition-all ${activeIndex === chartItems.length - 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </>
                )}
            </main>

            <footer className="p-6 text-center">
                <p className="text-sm text-gray-500">
                    Desliza para ver más información sobre tus finanzas.
                </p>
            </footer>

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
