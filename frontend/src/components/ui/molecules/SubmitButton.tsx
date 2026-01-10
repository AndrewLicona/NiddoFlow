'use client';

import React from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '../atoms/Button';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps {
    children: React.ReactNode;
    loadingText?: string;
    className?: string;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    icon?: React.ReactNode;
}

export const SubmitButton = ({
    children,
    loadingText = 'Guardando...',
    className = '',
    variant = 'primary',
    size = 'md',
    icon
}: SubmitButtonProps) => {
    const { pending } = useFormStatus();

    return (
        <Button
            type="submit"
            variant={variant}
            size={size}
            disabled={pending}
            className={className}
        >
            {pending ? (
                <>
                    <Loader2 className="mr-2 animate-spin" size={18} />
                    {loadingText}
                </>
            ) : (
                <>
                    {icon && <span className="mr-2">{icon}</span>}
                    {children}
                </>
            )}
        </Button>
    );
};
