import React from 'react';
import { Typography } from '../atoms/Typography';

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLSelectElement> {
    label?: string;
    error?: string;
    as?: 'input' | 'select';
}

export const InputField = ({
    label,
    error,
    as: Component = 'input',
    className = '',
    children,
    ...props
}: InputFieldProps) => {
    const inputStyles = `w-full px-4 py-3 rounded-xl border bg-card focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none ${error ? 'border-rose-500' : 'border-foreground/10'}`;

    const commonProps = {
        className: `${inputStyles} ${className}`,
        ...props
    };

    return (
        <div className="space-y-1.5 w-full">
            {label && <Typography variant="small" className="ml-1 text-foreground/60">{label}</Typography>}
            {Component === 'select' ? (
                <select {...(commonProps as React.SelectHTMLAttributes<HTMLSelectElement>)}>
                    {children}
                </select>
            ) : (
                <input {...(commonProps as React.InputHTMLAttributes<HTMLInputElement>)} />
            )}
            {error && <Typography variant="muted" className="text-red-500 ml-1">{error}</Typography>}
        </div>
    );
};
