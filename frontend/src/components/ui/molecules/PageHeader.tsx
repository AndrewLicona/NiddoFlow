import React from 'react';
import Link from 'next/link';
import { Typography } from '../atoms/Typography';

interface PageHeaderProps {
    title: string;
    description?: string;
    backHref?: string;
    actions?: React.ReactNode;
}

export const PageHeader = ({ title, description, backHref, actions }: PageHeaderProps) => {
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
                <div>
                    <Typography as="h1" variant="h1">{title}</Typography>
                    {description && <Typography variant="body" className="mt-0.5">{description}</Typography>}
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
