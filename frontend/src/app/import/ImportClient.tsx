"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    UploadCloud,
    FileSpreadsheet,
    AlertTriangle,
    CheckCircle2,
    Copy,
    ShieldCheck,
    Loader2,
    RotateCcw,
    ChevronDown,
} from "lucide-react";
import { useImport } from "@/hooks/useImport";
import { ImportRow } from "@/lib/api/import.api";
import { Button } from "@/components/ui/atoms/Button";
import { Card } from "@/components/ui/molecules/Card";
import { Typography } from "@/components/ui/atoms/Typography";
import { SelectField, selectStyles } from "@/components/ui/molecules/SelectField";
import { formatCurrency } from "@/utils/format";

const STATUS_META: Record<string, { label: string; className: string }> = {
    new: { label: "Nuevo", className: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-500/20" },
    duplicate: { label: "Duplicado", className: "bg-slate-50 text-slate-700 border-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
    conflict: { label: "Revisar", className: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-500/20" },
    invalid: { label: "Inválido", className: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-500/20" },
};

export default function ImportClient() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState("");
    const [result, setResult] = useState<{ created: number; skipped: number; errors: string[]; missing: number } | null>(null);

    const {
        preview,
        rows,
        updateRow,
        toggleAll,
        defaultAccountId,
        setDefaultAccountId,
        defaultCategoryId,
        setDefaultCategoryId,
        isAnalyzing,
        isImporting,
        error,
        analyze,
        commit,
        reset,
    } = useImport();

    const handleFile = (file: File) => {
        setFileName(file.name);
        setResult(null);
        analyze(file);
    };

    const handleCommit = async () => {
        try {
            const res = await commit();
            setResult({
                created: res.created,
                skipped: res.skipped,
                errors: res.errors,
                missing: res.missing_in_bank.length,
            });
        } catch {
            // El error ya se expone vía `error` en el hook.
        }
    };

    const selectedCount = rows.filter((r) => r.selected && r.status === "new").length;
    const totalSelected = rows
        .filter((r) => r.selected && r.status === "new")
        .reduce((acc, r) => acc + Math.abs(r.amount || 0), 0);

    return (
        <div className="space-y-6">
            {/* Zona de carga */}
            <Card className="p-6 md:p-10 border-dashed border-2 border-foreground/10 bg-card/50">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                        <UploadCloud size={30} />
                    </div>
                    <div>
                        <Typography variant="h3" className="font-black">Importa tu extracto bancario</Typography>
                        <Typography variant="small" className="text-muted-foreground mt-1 max-w-md">
                            Sube un archivo CSV u OFX de tu banco. Analizaremos el archivo y te mostraremos
                            qué se va a registrar <strong>antes</strong> de guardar nada.
                        </Typography>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.ofx,.qfx,.txt"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFile(file);
                        }}
                    />

                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAnalyzing}
                        className="gap-2"
                    >
                        {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                        {isAnalyzing ? "Analizando..." : "Seleccionar archivo"}
                    </Button>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <ShieldCheck size={14} className="text-emerald-500" />
                        <span>El análisis no escribe nada. Solo se guardan las filas que confirmes.</span>
                    </div>

                    {fileName && !preview && (
                        <Typography variant="small" className="text-muted-foreground">{fileName}</Typography>
                    )}
                </div>
            </Card>

            {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-500/20 p-4">
                    <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                    <div>
                        <Typography variant="body" className="font-bold text-rose-700 dark:text-rose-300">No se pudo continuar</Typography>
                        <Typography variant="small" className="text-rose-600 dark:text-rose-400">{error instanceof Error ? error.message : String(error)}</Typography>
                    </div>
                </div>
            )}

            {result && (
                <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-500/20 p-4">
                        <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                            <Typography variant="body" className="font-bold text-emerald-700 dark:text-emerald-300">
                                {result.created} movimientos importados
                            </Typography>
                            <Typography variant="small" className="text-emerald-600 dark:text-emerald-400">
                                {result.skipped} omitidos. {result.missing > 0 && `${result.missing} movimientos no aparecieron en el archivo y no se tocaron.`}
                            </Typography>
                        </div>
                    </div>
                    {result.errors.length > 0 && (
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-500/20 p-4">
                            <Typography variant="body" className="font-bold text-amber-700 dark:text-amber-300 mb-1">
                                Algunas filas no se pudieron importar
                            </Typography>
                            <ul className="text-xs space-y-0.5 text-amber-700 dark:text-amber-400">
                                {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
                            </ul>
                        </div>
                    )}
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => router.push("/transactions")}>
                            Ver movimientos
                        </Button>
                        <Button variant="ghost" onClick={reset} className="gap-2">
                            <RotateCcw size={14} /> Importar otro archivo
                        </Button>
                    </div>
                </div>
            )}

            {/* Tabla de previsualización */}
            {preview && !result && (
                <Card className="overflow-hidden">
                    <div className="p-5 border-b border-foreground/5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <Typography variant="h3" className="font-black">Revisa antes de importar</Typography>
                                <Typography variant="small" className="text-muted-foreground">
                                    Formato detectado: <strong>{preview.detected_format.toUpperCase()}</strong> · {preview.total} filas
                                </Typography>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px]">
                                <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 font-bold dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-500/20">
                                    {preview.new_count} nuevos
                                </span>
                                <span className="rounded-full bg-slate-50 text-slate-700 border border-slate-100 px-3 py-1 font-bold dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                    {preview.duplicate_count} duplicados
                                </span>
                                {preview.conflict_count > 0 && (
                                    <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1 font-bold dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-500/20">
                                        {preview.conflict_count} por revisar
                                    </span>
                                )}
                            </div>
                        </div>

                        {preview.errors.length > 0 && (
                            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 dark:bg-amber-900/20 dark:border-amber-500/20">
                                {preview.errors.map((e, i) => (
                                    <Typography key={i} variant="small" className="text-amber-700 dark:text-amber-400">{e}</Typography>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <SelectField
                                label="Cuenta por defecto"
                                value={defaultAccountId}
                                onChange={(e) => setDefaultAccountId(e.target.value)}
                            >
                                <option value="">Sin cuenta por defecto</option>
                                {preview.accounts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </SelectField>
                            <SelectField
                                label="Categoría por defecto"
                                value={defaultCategoryId}
                                onChange={(e) => setDefaultCategoryId(e.target.value)}
                            >
                                <option value="">Sin categoría</option>
                                {preview.categories.filter((c) => c.type === "expense").map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </SelectField>
                        </div>
                    </div>

                    <div className="overflow-x-auto max-h-[60vh]">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-card z-10">
                                <tr className="border-b border-foreground/10 text-left">
                                    <th className="p-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={selectedCount > 0 && selectedCount === rows.filter((r) => r.status === "new").length}
                                            onChange={(e) => toggleAll(e.target.checked)}
                                            aria-label="Seleccionar todo"
                                        />
                                    </th>
                                    <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Fecha</th>
                                    <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Descripción</th>
                                    <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-right">Importe</th>
                                    <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Categoría</th>
                                    <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <ImportRowView
                                        key={row.row_number}
                                        row={row}
                                        categories={preview.categories}
                                        onChange={(patch) => updateRow(row.row_number, patch)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-5 border-t border-foreground/5 flex flex-wrap items-center justify-between gap-3">
                        <Typography variant="small" className="text-muted-foreground">
                            {selectedCount} movimientos · {formatCurrency(totalSelected)}
                        </Typography>
                        <div className="flex gap-3">
                            <Button variant="ghost" onClick={reset} disabled={isImporting}>Cancelar</Button>
                            <Button onClick={handleCommit} disabled={isImporting || selectedCount === 0} className="gap-2">
                                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                                {isImporting ? "Importando..." : `Importar ${selectedCount} movimientos`}
                            </Button>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}

function ImportRowView({
    row,
    categories,
    onChange,
}: {
    row: ImportRow;
    categories: { id: string; name: string; type: string }[];
    onChange: (patch: Partial<ImportRow>) => void;
}) {
    const meta = STATUS_META[row.status] || STATUS_META.new;
    const editable = row.status === "new";

    return (
        <tr className={`border-b border-foreground/5 ${row.selected ? "" : "opacity-55"}`}>
            <td className="p-3">
                <input
                    type="checkbox"
                    checked={row.selected}
                    disabled={!editable}
                    onChange={(e) => onChange({ selected: e.target.checked })}
                    aria-label={`Seleccionar fila ${row.row_number}`}
                />
            </td>
            <td className="p-3 whitespace-nowrap text-muted-foreground">{row.date || "—"}</td>
            <td className="p-3">
                <div className="font-medium">{row.merchant || row.description || "—"}</div>
                {row.description && row.description !== row.merchant && (
                    <div className="text-[11px] text-muted-foreground">{row.description}</div>
                )}
            </td>
            <td className="p-3 text-right whitespace-nowrap font-bold">
                {row.amount !== null ? formatCurrency(Math.abs(row.amount)) : "—"}
            </td>
            <td className="p-3">
                <div className="relative">
                    <select
                        value={row.category_id || ""}
                        disabled={!editable}
                        onChange={(e) => onChange({ category_id: e.target.value || null })}
                        className={`${selectStyles} max-w-[150px] py-1 pl-2 pr-7 text-xs`}
                        aria-label="Categoría"
                    >
                        <option value="">Sin categoría</option>
                        {categories
                            .filter((c) => c.type === (row.type === "income" ? "income" : "expense"))
                            .map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                    </select>
                    <ChevronDown
                        size={12}
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                </div>
            </td>
            <td className="p-3">
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>
                    {meta.label}
                </span>
                {row.duplicate_reason && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[220px]">{row.duplicate_reason}</div>
                )}
                {row.warnings.map((w, i) => (
                    <div key={i} className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 max-w-[220px]">{w}</div>
                ))}
            </td>
        </tr>
    );
}
