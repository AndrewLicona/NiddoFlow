"use client";

import { useMutation } from "@tanstack/react-query";
import { ocrApi } from "@/lib/api/ocr.api";

/**
 * Lectura de una factura por OCR.
 *
 * Es una mutación (y no una query) porque el archivo se envía al backend:
 * no hay una URL que se pueda cachear.
 */
export function useOcrExtract() {
    return useMutation({
        mutationFn: (file: File) => ocrApi.extract(file),
    });
}

/**
 * Lectura de varias facturas en paralelo. El backend las procesa con un
 * límite de 3 concurrentes, así que no hace falta limitarlo aquí.
 */
export function useOcrExtractBulk() {
    return useMutation({
        mutationFn: (files: File[]) => ocrApi.extractBulk(files),
    });
}
