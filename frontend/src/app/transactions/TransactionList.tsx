// src/app/transactions/TransactionList.tsx
'use client';

import React, { useState } from 'react';

interface Transaction {
    id: string;
    description: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    date: string;
    category_name?: string;
    account_name?: string;
    user_name?: string;
}

interface Props {
    transactions: Transaction[];
}

const TransactionList: React.FC<Props> = ({ transactions }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
                {transactions.length === 0 ? (
                    <li className="px-4 py-8 text-center text-gray-800 font-medium">
                        No hay transacciones registradas aún.
                    </li>
                ) : (
                    transactions.map((t) => (
                        <li key={t.id} className="hover:bg-gray-50 transition-colors">
                            <div
                                className="px-4 py-4 sm:px-6 cursor-pointer"
                                onClick={() => toggleExpand(t.id)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-green-100 text-green-600' :
                                                t.type === 'expense' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                            }`}>
                                            {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '⇄'}
                                        </div>
                                        <div className="ml-4">
                                            <p className="text-sm font-bold text-gray-900">{t.description}</p>
                                            <p className="text-sm text-gray-600 font-medium">{new Date(t.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                        </div>
                                    </div>
                                    <div className="text-right flex items-center space-x-3">
                                        <p className={`text-sm font-bold ${t.type === 'income' ? 'text-green-600' :
                                                t.type === 'expense' ? 'text-red-600' : 'text-gray-900'
                                            }`}>
                                            {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount)}
                                        </p>
                                        <svg
                                            className={`h-5 w-5 text-gray-400 transition-transform ${expandedId === t.id ? 'rotate-180' : ''}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="G19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed View */}
                            {expandedId === t.id && (
                                <div className="px-4 pb-4 sm:px-6 bg-gray-50 border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                                        <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Categoría</p>
                                            <p className="text-sm font-medium text-gray-700">{t.category_name || 'Sin categoría'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cuenta</p>
                                            <p className="text-sm font-medium text-gray-700">{t.account_name || 'Desconocida'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Registrado por</p>
                                            <p className="text-sm font-medium text-gray-700">{t.user_name || 'Sistema'}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end space-x-3">
                                        {/* Future edit/delete buttons could go here */}
                                    </div>
                                </div>
                            )}
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
};

export default TransactionList;
