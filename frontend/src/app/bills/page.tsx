import { PageHeader } from '@/components/ui/molecules/PageHeader';
import BillsClient from './BillsClient';

export const metadata = {
    title: 'Cuentas del hogar | NiddoFlow',
};

export default function BillsPage() {
    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 pb-32">
            <PageHeader
                title="Cuentas del hogar"
                description="Arriendo, servicios, seguros y demás compromisos que se repiten cada mes."
                backHref="/dashboard"
            />

            <BillsClient />
        </main>
    );
}
