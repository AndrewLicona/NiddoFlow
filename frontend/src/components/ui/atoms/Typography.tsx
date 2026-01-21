import React from 'react';

interface TypographyProps {
    children: React.ReactNode;
    className?: string;
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
    variant?: 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'muted';
}

export const Typography = ({
    children,
    className = '',
    as: Component = 'p',
    variant = 'body',
    ...props
}: TypographyProps & React.HTMLAttributes<HTMLElement>) => {
    const variants = {
        h1: 'text-3xl font-black text-foreground tracking-tight md:text-4xl',
        h2: 'text-2xl font-bold text-foreground tracking-tight',
        h3: 'text-lg font-bold text-foreground',
        body: 'text-sm text-foreground leading-relaxed',
        small: 'text-[10px] font-black text-foreground/90 uppercase tracking-widest',
        muted: 'text-xs text-foreground/75',
    };

    return (
        <Component className={`${variants[variant]} ${className}`} {...props}>
            {children}
        </Component>
    );
};
