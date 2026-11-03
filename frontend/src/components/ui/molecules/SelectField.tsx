import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Typography } from '../atoms/Typography';

/**
 * Estilos compartidos por todos los desplegables (`<select>`) de la app.
 *
 * Decisiones de diseño:
 * - `appearance-none` + chevron propio: el triangulo nativo cambia de forma
 *   entre Windows, macOS, Android e iOS. Con esto todos los desplegables
 *   se ven igual en PC y en mobile.
 * - `text-base sm:text-sm`: en mobile el texto del control es de 16px. Por
 *   debajo de 16px, iOS Safari hace zoom automatico al enfocar el campo y
 *   descuadra el formulario.
 * - `py-3` + `cursor-pointer`: area tactil comoda en pantallas pequenas.
 * - `pr-10`: deja sitio al chevron para que el texto no lo pise.
 *
 * El ancho NO se fija aqui (`w-full`): cada uso decide si quiere ocupar todo
 * el ancho disponible o ajustarse al contenido (celdas de tabla, filtros).
 */
export const selectStyles = `
    appearance-none rounded-xl border bg-card pl-4 pr-10 py-3
    text-base sm:text-sm text-foreground
    focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
    transition-all outline-none cursor-pointer
    disabled:opacity-50 disabled:cursor-not-allowed
`;

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    hint?: string;
    /** Ajustes del contenedor (por ejemplo `w-40`). */
    wrapperClassName?: string;
}

/**
 * Desplegable con estilos consistentes para mobile y PC.
 *
 * Sustituye al `<select>` nativo suelto: mismo markup, mismo look.
 */
export const SelectField = ({
    label,
    error,
    hint,
    className = '',
    wrapperClassName = '',
    children,
    ...props
}: SelectFieldProps) => {
    return (
        <div className={`space-y-1.5 w-full ${wrapperClassName}`}>
            {label && (
                <Typography variant="small" className="ml-1 text-foreground/60">
                    {label}
                </Typography>
            )}
            <div className="relative">
                <select
                    {...props}
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
            {hint && !error && (
                <Typography variant="muted" className="ml-1">
                    {hint}
                </Typography>
            )}
            {error && (
                <Typography variant="muted" className="text-red-500 ml-1">
                    {error}
                </Typography>
            )}
        </div>
    );
};

export default SelectField;
