import { PageHeader } from '@/components/ui/molecules/PageHeader';
import ImportClient from './ImportClient';

export const metadata = {
    title: 'Importar movimientos | NiddoFlow',
};

export default function ImportPage() {
    return (
        <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 pb-32">
            <PageHeader
                title="Importar movimientos"
                description="Sube el extracto de tu banco y registra los movimientos de un solo golpe."
                backHref="/transactions"
            />

            <ImportClient />
        </main>
    );
}
