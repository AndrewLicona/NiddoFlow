import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Typography } from '../atoms/Typography';
import { selectStyles } from './SelectField';

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
                // El desplegable usa los estilos compartidos (appearance-none +
                // chevron propio + 16px en mobile) para verse igual en PC y
                // en pantalla pequena, sin el zoom automatico de iOS.
                <div className="relative">
                    <select
                        {...(props as React.SelectHTMLAttributes<HTMLSelectElement>)}
                        className={`${selectStyles} w-full ${error ? 'border-rose-500' : 'border-foreground/10'} ${className}`}
                    >
                        {children}
                    </select>
                    <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                </div>
            ) : (
                <input {...(commonProps as React.InputHTMLAttributes<HTMLInputElement>)} />
            )}
            {error && <Typography variant="muted" className="text-red-500 ml-1">{error}</Typography>}
        </div>
    );
};
