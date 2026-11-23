'use client';

import { Children, Fragment, isValidElement, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

type ChoiceProps = { value?: string; label?: string; children?: ReactNode };

export function ChoiceSheet({ label, name, value, required, children, onValueChange }: {
    label: string;
    name: string;
    value?: string;
    required?: boolean;
    children: ReactNode;
    onValueChange?: (value: string) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const groups = Children.toArray(children).flatMap(child => {
        if (!isValidElement<ChoiceProps>(child)) return [];
        return child.type === 'optgroup'
            ? [{ label: child.props.label, options: Children.toArray(child.props.children) }]
            : [{ label: undefined, options: [child] }];
    });
    const options = groups.flatMap(group => group.options).filter(isValidElement<ChoiceProps>);
    const [localValue, setLocalValue] = useState(() => options[0]?.props.value ?? '');
    const selected = value ?? localValue;
    const selectedLabel = options.find(option => option.props.value === selected)?.props.children;

    return (
        <div className="space-y-1.5">
            <select aria-hidden="true" tabIndex={-1} className="sr-only" name={name} value={selected} required={required}
                onChange={event => {
                    setLocalValue(event.target.value);
                    onValueChange?.(event.target.value);
                }}
                onInvalid={event => {
                    event.preventDefault();
                    if (!dialog.current?.open) dialog.current?.showModal();
                }}>
                {children}
            </select>
            <button type="button" aria-haspopup="dialog"
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-foreground/15 bg-card px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => dialog.current?.showModal()}>
                <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">{label}</span>
                    <span className="block truncate font-semibold">{selectedLabel ?? 'Seleccionar'}</span>
                </span>
                <ChevronDown aria-hidden="true" size={18} className="shrink-0 text-muted-foreground" />
            </button>
            <dialog ref={dialog} aria-labelledby={titleId}
                className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[75dvh] w-full max-w-none overflow-auto rounded-t-3xl border border-foreground/15 bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground backdrop:bg-black/50 sm:inset-0 sm:m-auto sm:w-[28rem] sm:rounded-3xl">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 id={titleId} className="text-lg font-bold">{label}</h2>
                    <button type="button" aria-label="Cerrar" onClick={() => dialog.current?.close()} className="rounded-lg p-3 hover:bg-muted"><X size={18} /></button>
                </div>
                {groups.map(({ label: groupLabel, options: groupOptions }, index) => (
                    <Fragment key={index}>
                        {groupLabel && <p className="mt-3 px-3 py-1 text-xs font-bold text-muted-foreground">{groupLabel}</p>}
                        {groupOptions.filter(isValidElement<ChoiceProps>).map(option => {
                            const next = option.props.value ?? '';
                            if (required && next === '') return null;
                            return (
                                <button key={next} type="button" aria-pressed={next === selected}
                                    className="mb-1 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:text-primary"
                                    onClick={() => {
                                        setLocalValue(next);
                                        onValueChange?.(next);
                                        dialog.current?.close();
                                    }}>
                                    {option.props.children}
                                    {next === selected && <Check size={18} aria-hidden="true" />}
                                </button>
                            );
                        })}
                    </Fragment>
                ))}
            </dialog>
        </div>
    );
}
