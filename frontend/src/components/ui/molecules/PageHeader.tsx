import React from 'react';
import Link from 'next/link';
import { Typography } from '../atoms/Typography';

interface PageHeaderProps {
    title: string;
    description?: string;
    backHref?: string;
    actions?: React.ReactNode;
    showProfile?: boolean;
    userProfile?: any;
}

export const PageHeader = ({ title, description, backHref, actions, showProfile, userProfile }: PageHeaderProps) => {
    return (
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center space-x-4">
                {backHref && (
                    <Link
                        href={backHref}
                        className="p-2.5 rounded-full bg-card shadow-sm border border-foreground/5 text-blue-600 hover:text-blue-700 hover:scale-110 active:scale-90 transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7" />
                        </svg>
                    </Link>
                )}
                <div className="flex items-center space-x-4">
                    {showProfile && userProfile && (
                        <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/20">
                            {userProfile.full_name?.charAt(0) || userProfile.email?.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <Typography as="h1" variant="h1" className="tracking-tight">{title}</Typography>
                        {description && <Typography variant="body" className="mt-0.5 opacity-60">{description}</Typography>}
                    </div>
                </div>
            </div>
            {actions && (
                <div className="flex items-center space-x-3">
                    {actions}
                </div>
            )}
        </header>
    );
};
