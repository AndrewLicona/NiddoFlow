import { PageHeader } from '@/components/ui/molecules/PageHeader';
import GoalsClient from './GoalsClient';

export const metadata = {
    title: 'Metas de ahorro | NiddoFlow',
};

export default function GoalsPage() {
    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 pb-32">
            <PageHeader
                title="Metas de ahorro"
                description="Define un objetivo, registra tus aportes y mira cuánto te falta para alcanzarlo."
                backHref="/"
            />

            <GoalsClient />
        </main>
    );
}
