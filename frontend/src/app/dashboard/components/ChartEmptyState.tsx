import { BarChart3, Plus } from 'lucide-react';
import { Typography } from '@/components/ui/atoms/Typography';
import { Card } from '@/components/ui/molecules/Card';
import Link from 'next/link';

export function ChartEmptyState() {
    return (
        <Card variant="elevated" className="flex flex-col items-center justify-center min-h-[450px] p-8 text-center bg-gradient-to-br from-background to-background/50 relative overflow-hidden">
            {/* Background Decorative Pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M0 100 C 20 0 50 0 100 100 Z" fill="currentColor" />
                </svg>
            </div>

            <div className="bg-primary/10 p-6 rounded-full mb-6 ring-8 ring-primary/5 animate-pulse-slow">
                <BarChart3 className="text-primary w-12 h-12" />
            </div>

            <Typography variant="h3" className="mb-2 font-bold text-foreground">
                Aún no hay datos suficientes
            </Typography>

            <Typography variant="body" className="text-muted-foreground max-w-md mb-8">
                Tus gráficos cobrarán vida en cuanto empieces a registrar tus ingresos y gastos.
                ¡Es hora de tomar el control!
            </Typography>

            <Link
                href="/dashboard?action=new-transaction"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
                <Plus size={20} />
                Registrar Primer Movimiento
            </Link>
        </Card>
    );
}
