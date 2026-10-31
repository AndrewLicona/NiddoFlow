"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { importApi, ImportPreview, ImportRow } from "@/lib/api/import.api";

/**
 * Importador de movimientos bancarios.
 *
 * El flujo es deliberadamente de dos pasos: primero se analiza el archivo
 * (`preview`, que no escribe nada) y el usuario revisa; solo después se
 * confirman las filas (`commit`).
 */
export function useImport() {
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [defaultAccountId, setDefaultAccountId] = useState<string>("");
    const [defaultCategoryId, setDefaultCategoryId] = useState<string>("");

    const previewMutation = useMutation({
        mutationFn: (file: File) => importApi.preview(file),
        onSuccess: (data) => {
            setPreview(data);
            setRows(data.rows);
            setDefaultAccountId(data.accounts[0]?.id || "");
            setDefaultCategoryId("");
        },
    });

    const commitMutation = useMutation({
        mutationFn: () => importApi.commit(rows, defaultAccountId, defaultCategoryId),
        onSuccess: () => {
            setPreview(null);
            setRows([]);
        },
    });
    const updateRow = (rowNumber: number, patch: Partial<ImportRow>) => {
        setRows((prev) => prev.map((r) => (r.row_number === rowNumber ? { ...r, ...patch } : r)));
    };

    const toggleAll = (selected: boolean) => {
        setRows((prev) =>
            prev.map((r) => (r.status === "new" ? { ...r, selected } : r))
        );
    };

    const reset = () => {
        setPreview(null);
        setRows([]);
        previewMutation.reset();
        commitMutation.reset();
    };

    return {
        preview,
        rows,
        setRows,
        updateRow,
        toggleAll,
        defaultAccountId,
        setDefaultAccountId,
        defaultCategoryId,
        setDefaultCategoryId,
        isAnalyzing: previewMutation.isPending,
        isImporting: commitMutation.isPending,
        error: previewMutation.error || commitMutation.error,
        analyze: (file: File) => previewMutation.mutate(file),
        commit: () => commitMutation.mutateAsync(),
        reset,
    };
}
