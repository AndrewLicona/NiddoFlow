'use client';

import { usePathname } from 'next/navigation';
import { Navigation } from '@/components/ui/organisms/Navigation';
import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const isAuthPage = pathname === '/login' || pathname === '/register' || pathname.startsWith('/onboarding');
    const isRoot = pathname === '/';

    // Hide navigation if it's an auth page, OR if we're on the root path and still loading or don't have a session
    const hideNav = isAuthPage || (isRoot && (loading || !session));

    return (
        <div className={`antialiased min-h-screen transition-all duration-300 ${!hideNav ? 'mb-20 md:mb-0 md:pl-24' : ''}`}>
            {!hideNav && <Navigation />}
            <div className={`w-full ${!hideNav ? 'max-w-7xl mx-auto' : ''}`}>
                {children}
            </div>
        </div>
    );
}
