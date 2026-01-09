'use client';

import React, { useRef, useState, useMemo } from 'react';
import { Card } from '@/components/ui/molecules/Card';
import { Typography } from '@/components/ui/atoms/Typography';
import { Button } from '@/components/ui/atoms/Button';
import { InputField } from '@/components/ui/molecules/InputField';
import { Download, Share2, FileText, Loader2, Calendar, PieChart as PieChartIcon, BarChart2, Users, Printer, TrendingUp, AlertCircle, Info } from 'lucide-react';
import { formatCurrency } from '@/utils/format';
import CategoryBarChart from '@/app/dashboard/charts/CategoryBarChart';
import ExpenseCategoryDonutChart from '@/app/dashboard/charts/ExpenseCategoryDonutChart';
import IncomeExpenseBarChart from '@/app/dashboard/charts/IncomeExpenseBarChart';
import UserExpensesPieChart from '@/app/dashboard/charts/UserExpensesPieChart';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Props {
    transactions: any[];
}

export default function ReportsClient({ transactions }: Props) {
    const reportRef = useRef<HTMLDivElement>(null);

    // Date Range State
    const today = new Date();
    const [startDate, setStartDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]);

    // Filter Data
    const filteredTransactions = useMemo(() => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        return transactions.filter(t => {
            const d = new Date(t.date);
            return d >= start && d <= end;
        });
    }, [transactions, startDate, endDate]);

    // Financial Analysis (Insights)
    const insights = useMemo(() => {
        const income = filteredTransactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
        const expense = filteredTransactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
        const balance = income - expense;

        // Categoría de mayor gasto
        const catMap: Record<string, number> = {};
        filteredTransactions.filter(t => t.type === 'expense').forEach(t => {
            const cat = t.category_name || 'Otros';
            catMap[cat] = (catMap[cat] || 0) + Number(t.amount);
        });
        const topCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];

        // Promedio diario
        const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const dailyAvg = expense / days;

        // Tasa de ahorro
        const savingsRate = income > 0 ? (balance / income) * 100 : 0;

        return { income, expense, balance, topCategory, dailyAvg, savingsRate, txCount: filteredTransactions.length };
    }, [filteredTransactions, startDate, endDate]);



    const [containerHeight, setContainerHeight] = useState<string | number>('auto');

    // Dynamic height adjustment for mobile preview scaling
    React.useEffect(() => {
        const updateLayout = () => {
            if (!reportRef.current) return;

            const container = document.querySelector('.report-preview-container') as HTMLElement;
            const wrapper = document.querySelector('.printable-wrapper') as HTMLElement;
            if (!container || !wrapper) return;

            const containerWidth = container.offsetWidth;
            const isMobile = window.innerWidth <= 768;

            // MATH FIX: Use container width instead of 100vw to avoid overflow/narrowness
            // padding a bit (32px) for aesthetics
            const targetWidth = isMobile ? containerWidth - 32 : 900;
            const scale = isMobile ? targetWidth / 900 : 1;

            wrapper.style.transform = `scale(${scale})`;

            // Set container height to exactly match the scaled content + top/bottom padding
            const scaledHeight = reportRef.current.scrollHeight * scale;
            const headerHeight = 60; // Approximate height of the tab bar
            setContainerHeight(Math.max(400, scaledHeight + headerHeight + 80));
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        const timer = setTimeout(updateLayout, 1000);

        return () => {
            window.removeEventListener('resize', updateLayout);
            clearTimeout(timer);
        };
    }, [filteredTransactions, startDate, endDate]);

    const shareReport = async () => {
        const text = `📊 *Reporte NiddoFlow (${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()})*\n\n` +
            `💰 Ingresos: ${formatCurrency(insights.income)}\n` +
            `💸 Gastos: ${formatCurrency(insights.expense)}\n` +
            `⚖️ Balance: ${formatCurrency(insights.balance)}\n\n` +
            `🏆 Categoría Top: ${insights.topCategory[0]}\n` +
            `📅 Gasto Diario: ${formatCurrency(insights.dailyAvg)}\n\n` +
            `Generado desde la App.`;

        if (navigator.share) {
            try {
                await navigator.share({ title: 'Reporte NiddoFlow', text: text });
            } catch (err) {
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            }
        } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        }
    };

    const downloadCSV = () => {
        const headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'];
        const csvContent = [
            headers.join(','),
            ...filteredTransactions.map(t => [
                new Date(t.date).toLocaleDateString('es-CO'),
                t.type === 'income' ? 'Ingreso' : 'Gasto',
                `"${t.category_name || 'Sin Categoría'}"`,
                `"${(t.description || '').replace(/"/g, '""')}"`,
                t.amount
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `niddo-reporte-${startDate}-${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="reports-page space-y-8 pb-20">
            {/* Global Styles for PDF & Mobile Preview */}
            <style jsx global>{`
                .force-light-report {
                    background-color: white !important;
                    color: #0F172A !important;
                    font-family: 'Inter', sans-serif;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                .force-light-report h1, 
                .force-light-report h2, 
                .force-light-report h3, 
                .force-light-report p, 
                .force-light-report span, 
                .force-light-report td, 
                .force-light-report th,
                .force-light-report strong {
                    color: #0F172A !important;
                }
                
                /* EXCEPTION: Dark cards should keep white text and visible percentage */
                .force-light-report .bg-slate-900,
                .force-light-report .bg-slate-900 h1,
                .force-light-report .bg-slate-900 h2,
                .force-light-report .bg-slate-900 h3,
                .force-light-report .bg-slate-900 p,
                .force-light-report .bg-slate-900 span,
                .force-light-report .bg-slate-900 div {
                    color: #FFFFFF !important;
                }

                .force-light-report .bg-white { background-color: #FFFFFF !important; }
                .force-light-report .border-slate-200 { border-color: #E2E8F0 !important; }
                
                /* FIX: Chart Labels and Tooltips in Dark Mode */
                .force-light-report .recharts-cartesian-axis-tick text {
                    fill: #64748B !important;
                }
                .force-light-report .recharts-legend-item-text {
                    color: #0F172A !important;
                }
                .force-light-report .recharts-default-tooltip {
                    background-color: #FFFFFF !important;
                    border: 1px solid #E2E8F0 !important;
                    color: #0F172A !important;
                    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1) !important;
                }
                .force-light-report .recharts-tooltip-item,
                .force-light-report .recharts-tooltip-item * {
                    color: #0F172A !important;
                }
                .force-light-report .recharts-tooltip-label {
                    color: #64748B !important;
                    font-weight: bold !important;
                }
                
                /* FIX: Legend Alignment globally */
                .recharts-legend-item {
                    display: inline-flex !important;
                    align-items: center !important;
                    margin-right: 12px !important;
                }
                .recharts-legend-item svg {
                    display: inline-block !important;
                    vertical-align: middle !important;
                    margin-right: 4px !important;
                }
                .recharts-surface {
                    overflow: visible !important;
                }
                
                /* Global Preview Container */
                .report-preview-container {
                    width: 100%;
                    background: #F8FAFC; 
                    border: 1px solid #E2E8F0;
                    border-radius: 2rem;
                    position: relative; /* REQUIRED for absolute scaling child */
                    overflow: hidden;
                    transition: height 0.3s ease;
                }

                .printable-wrapper {
                    position: absolute;
                    left: 50%;
                    top: 0;
                    width: 900px !important;
                    margin-left: -450px; /* Center 900px base */
                    background: white;
                    transform-origin: top center;
                    transition: transform 0.3s ease;
                }

                /* PC Preview: Full Centered Sheet View */
                @media screen and (min-width: 769px) {
                    .report-preview-container {
                        background: #F1F5F9;
                    }
                    .printable-wrapper {
                        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
                        border: 1px solid #E2E8F0;
                        margin-top: 40px;
                        margin-bottom: 40px;
                    }
                }
                
                /* Mobile Preview: Perfectly Scaled Sheet */
                @media screen and (max-width: 768px) {
                    .report-preview-container {
                        background: #F1F5F9;
                    }
                    .printable-wrapper {
                        margin-top: 16px;
                        box-shadow: 0 10px 20px rgba(0,0,0,0.05);
                    }
                }
                
                @media print {
                    /* 1. Isolation Path: Only show the report and its necessary wrappers */
                    body > *:not(main),
                    main > *:not(.reports-page),
                    .reports-page > *:not(.report-preview-container),
                    .report-preview-container > *:not(.printable-wrapper),
                    nav, header, footer, .no-print {
                        display: none !important;
                    }

                    /* 2. Reset ancestors to 0 flow */
                    html, body, main, .antialiased, .reports-page, .report-preview-container, .printable-wrapper {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                        height: auto !important;
                        min-height: 0 !important;
                        display: block !important;
                        overflow: visible !important;
                        width: 100% !important;
                        min-width: 21cm !important; /* Force min width for proper scaling */
                        max-width: none !important;
                        box-shadow: none !important;
                        border: none !important;
                        transform: none !important;
                        position: absolute !important; /* Absolute positioning relative to page helps with margin consistency */
                        left: 0 !important;
                        top: 0 !important;
                    }

                    /* 3. Forces for charts and KPI colors */
                    svg, svg * {
                        display: block !important;
                        visibility: visible !important;
                    }

                    .bg-emerald-50 { background-color: #ECFDF5 !important; }
                    .bg-rose-50 { background-color: #FFF1F2 !important; }
                    .bg-blue-50 { background-color: #EFF6FF !important; }
                    .bg-slate-900 { background-color: #0F172A !important; }
                    .text-white { color: #FFFFFF !important; }

                    /* 4. Chart & Page Break Handling */
                    .break-avoid {
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }

                    /* 5. Force A4 Width & Legibility */
                    #printable-report-content {
                        width: 100% !important; /* Let margins control layout */
                        max-width: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        display: block !important;
                        background: white !important;
                        min-height: 100vh !important;
                    }
                    
                    /* Improve Text Contrast for Charts in Print */
                    .recharts-text {
                        fill: #0F172A !important;
                        font-weight: 600 !important;
                        font-size: 10px !important; 
                    }
                    .recharts-legend-item-text {
                        font-size: 11px !important;
                        line-height: 1 !important;
                        color: #334155 !important;
                        white-space: nowrap !important;
                    }
                    .recharts-legend-item {
                        display: inline-flex !important;
                        align-items: center !important;
                    }
                    .recharts-cartesian-axis-tick-value {
                        font-size: 10px !important;
                        font-weight: bold !important;
                    }

                    @page {
                        size: A4 portrait;
                        margin: 1.5cm; /* Fixes missing top margin on subsequent pages */
                    }
                }
            `}</style>

            {/* Config & Actions */}
            <section className="config-section grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card variant="flat" className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900/50 dark:to-slate-800/50 border-blue-100 dark:border-slate-700">
                    <Typography variant="h3" className="flex items-center gap-2 mb-4 text-blue-800 dark:text-blue-300">
                        <Calendar size={18} /> Fecha del Reporte
                    </Typography>
                    <div className="flex gap-4">
                        <InputField label="Desde" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        <InputField label="Hasta" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                </Card>

                <div className="grid grid-cols-2 gap-4">
                    <Button onClick={() => window.print()} className="h-full flex flex-col gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/20 py-6" variant="primary">
                        <Printer size={24} />
                        <span className="font-bold">Imprimir Reporte</span>
                    </Button>
                    <div className="grid grid-rows-2 gap-2">
                        <Button onClick={downloadCSV} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 shadow-emerald-500/10" variant="primary">
                            <Download size={16} />
                            <span className="text-xs font-bold">Descargar Historial (CSV)</span>
                        </Button>
                        <Button onClick={shareReport} className="w-full flex items-center justify-center gap-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200" variant="outline">
                            <Share2 size={16} />
                            <span className="text-xs font-bold">Whatsapp</span>
                        </Button>
                    </div>
                </div>
            </section>

            {/* Mobile Insight Cards (Quick View) */}
            <div className="mobile-insights md:hidden grid grid-cols-2 gap-3">
                <Card variant="outline" className="p-3 text-center">
                    <Typography variant="small" className="opacity-50 text-[10px] uppercase">Gasto Diario</Typography>
                    <Typography variant="h3" className="text-sm">{formatCurrency(insights.dailyAvg)}</Typography>
                </Card>
                <Card variant="outline" className="p-3 text-center">
                    <Typography variant="small" className="opacity-50 text-[10px] uppercase">Top Categoría</Typography>
                    <Typography variant="h3" className="text-sm truncate px-2">{insights.topCategory[0]}</Typography>
                </Card>
            </div>

            {/* The Report Preview */}
            <div className="report-preview-container shadow-2xl dark:bg-slate-950" style={{ height: containerHeight }}>
                <div className="preview-header bg-white dark:bg-slate-900 p-4 border-b dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-2">
                    <Typography variant="h3" className="text-sm font-black tracking-tight flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        VISTA PREVIA DE IMPRESIÓN
                    </Typography>
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-widest shrink-0">
                        Formato A4 Estándar
                    </span>
                </div>

                <div className="printable-wrapper">
                    <div
                        ref={reportRef}
                        id="printable-report-content"
                        className="force-light-report p-10 bg-white space-y-10 w-[900px] mx-auto"
                        style={{ minHeight: '1200px' }}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center border-b-2 border-slate-100 pb-8 break-avoid">
                            <div className="space-y-1">
                                <h1 className="text-4xl font-black tracking-tighter text-blue-600">NiddoFlow</h1>
                                <p className="text-sm font-medium text-slate-400 uppercase tracking-widest">Resumen Financiero Ejecutivo</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xl font-bold">{new Date(startDate).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }).toUpperCase()}</p>
                                <p className="text-xs font-bold text-slate-400 tracking-wider">GENERADO: {new Date().toLocaleDateString()}</p>
                                <p className="text-[10px] text-blue-500 font-bold mt-1">ID: REF-{Math.random().toString(36).substr(2, 6).toUpperCase()}</p>
                            </div>
                        </div>

                        {/* Insights & Metrics Dashboard */}
                        <div className="grid grid-cols-4 gap-4 break-avoid">
                            <div className="col-span-1 p-5 rounded-3xl bg-emerald-50 border border-emerald-100/50 flex flex-col justify-between">
                                <p className="text-[10px] font-black uppercase tracking-tighter text-emerald-700 opacity-70">Total Ingresos</p>
                                <p className="text-2xl font-black text-emerald-600 tracking-tighter">{formatCurrency(insights.income)}</p>
                            </div>
                            <div className="col-span-1 p-5 rounded-3xl bg-rose-50 border border-rose-100/50 flex flex-col justify-between">
                                <p className="text-[10px] font-black uppercase tracking-tighter text-rose-700 opacity-70">Total Gastos</p>
                                <p className="text-2xl font-black text-rose-600 tracking-tighter">{formatCurrency(insights.expense)}</p>
                            </div>
                            <div className="col-span-1 p-5 rounded-3xl bg-blue-50 border border-blue-100/50 flex flex-col justify-between">
                                <p className="text-[10px] font-black uppercase tracking-tighter text-blue-700 opacity-70">Balance Neto</p>
                                <p className="text-2xl font-black text-blue-600 tracking-tighter">{formatCurrency(insights.balance)}</p>
                            </div>
                            <div className="col-span-1 p-5 rounded-3xl bg-slate-900 text-white flex flex-col justify-between">
                                <p className="text-[10px] font-black uppercase tracking-tighter text-slate-400">Ahorro (%)</p>
                                <p className="text-2xl font-black tracking-tighter text-white">{insights.savingsRate.toFixed(1)}%</p>
                            </div>
                        </div>

                        {/* Automatic Interpretation */}
                        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 flex gap-6 items-center break-avoid">
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shrink-0">
                                <TrendingUp size={24} />
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-bold text-slate-900">Análisis Inteligente</h3>
                                <p className="text-sm text-slate-600 leading-relaxed">
                                    En este período, tu categoría de mayor impacto fue <strong className="text-slate-900">{insights.topCategory[0]}</strong> con un total de <strong>{formatCurrency(insights.topCategory[1] as number)}</strong>.
                                    Tu promedio de gasto diario es de <strong>{formatCurrency(insights.dailyAvg)}</strong>.
                                    {insights.balance > 0 ? " ¡Vas por buen camino, mantienes un balance positivo!" : " Se recomienda revisar los gastos preventivos para el próximo ciclo."}
                                </p>
                            </div>
                        </div>

                        {/* Chart Grid */}
                        <div className="grid grid-cols-2 gap-10">
                            <div className="space-y-6 break-avoid">
                                <div className="space-y-1 border-l-4 border-rose-500 pl-4">
                                    <h3 className="font-bold text-xl tracking-tight leading-none text-slate-900">Gastos por Categoría</h3>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Distribución del Capital</p>
                                </div>
                                <div className="h-96 w-full p-4 bg-slate-50/50 rounded-3xl border border-slate-100 flex items-center justify-center">
                                    <ExpenseCategoryDonutChart transactions={filteredTransactions} />
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-500 font-medium">
                                    <AlertCircle size={14} className="inline mr-1 mb-1" />
                                    Este gráfico agrupa tus gastos por las categorías configuradas. Ayuda a visualizar dónde se está "yendo el dinero".
                                </div>
                            </div>

                            <div className="space-y-6 break-avoid">
                                <div className="space-y-1 border-l-4 border-purple-500 pl-4">
                                    <h3 className="font-bold text-xl tracking-tight leading-none text-slate-900">Gasto por Integrante</h3>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Participación del Hogar</p>
                                </div>
                                <div className="h-96 w-full p-4 bg-slate-50/50 rounded-3xl border border-slate-100 flex items-center justify-center">
                                    <UserExpensesPieChart transactions={filteredTransactions} />
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-500 font-medium">
                                    <Info size={14} className="inline mr-1 mb-1" />
                                    Muestra el porcentaje de gastos registrados por cada persona en el grupo familiar.
                                </div>
                            </div>
                        </div>



                        {/* Recent Table */}
                        <div className="space-y-6 break-avoid">
                            <div className="flex justify-between items-end">
                                <div className="space-y-1 border-l-4 border-slate-900 pl-4">
                                    <h3 className="font-bold text-xl tracking-tight leading-none text-slate-900">Detalle de Operaciones</h3>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Movimientos del Período</p>
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 italic">Registros en reporte: {Math.min(filteredTransactions.length, 30)} de {filteredTransactions.length}</p>
                            </div>
                            <div className="border border-slate-200 rounded-[2rem] overflow-hidden">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead className="bg-slate-100 text-slate-600 font-black text-[11px] uppercase tracking-tighter">
                                        <tr>
                                            <th className="p-4 pl-6">Fecha</th>
                                            <th className="p-4">Descripción / Categoría</th>
                                            <th className="p-4 pr-6 text-right">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredTransactions.slice(0, 30).map((t, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4 pl-6 text-slate-500 font-medium">{new Date(t.date).toLocaleDateString()}</td>
                                                <td className="p-4">
                                                    <div className="font-bold text-slate-800 truncate max-w-[300px]">{t.description}</div>
                                                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{t.category_name || 'Sin Categoría'}</div>
                                                </td>
                                                <td className={`p-4 pr-6 text-right font-mono font-black border-l border-slate-50/50 ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="pt-20 border-t border-slate-100 flex justify-between items-center opacity-30 italic text-[10px] font-bold uppercase tracking-[0.2em] break-avoid">
                            <p>© {new Date().getFullYear()} NiddoFlow Systems</p>
                            <p>Autenticado y Verificado</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
