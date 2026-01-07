'use client';

import { usePathname } from 'next/navigation';
import { Navigation } from '@/components/ui/organisms/Navigation';

export default function MainLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAuthPage = pathname === '/login' || pathname === '/register' || pathname.startsWith('/onboarding');

    return (
        <div className={`antialiased min-h-screen ${!isAuthPage ? 'mb-20 md:mb-0 md:pl-20' : ''}`}>
            <Navigation />
            {children}
        </div>
    );
}
