import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    variant?: 'flat' | 'elevated' | 'glass' | 'outline';
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = ({
    children,
    className = '',
    variant = 'elevated',
    padding = 'md'
}: CardProps) => {
    const variants = {
        flat: 'bg-card',
        elevated: 'bg-card shadow-sm border border-foreground/[0.05] hover:shadow-md transition-shadow duration-300',
        glass: 'bg-card/80 backdrop-blur-md border border-foreground/[0.1] shadow-xl',
        outline: 'bg-transparent border-2 border-dashed border-foreground/10 hover:border-blue-500/30 transition-colors',
    };

    const paddings = {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-6',
        lg: 'p-8',
    };

    return (
        <div className={`rounded-2xl ${variants[variant]} ${paddings[padding]} ${className}`}>
            {children}
        </div>
    );
};
