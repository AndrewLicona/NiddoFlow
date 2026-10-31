import { fetchWithAuthFormData } from "./client";

export interface OcrItem {
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    category?: string | null;
    category_id?: string | null;
    confidence?: number | null;
}

/** Cuotas de tarjeta. Todos los campos son opcionales en el backend. */
export interface OcrInstallments {
    current: number | null;
    total: number | null;
    purchase_total_amount: number | null;
}

/**
 * Confianza (0-1) por campo clave de la extracción.
 * Se declara como `type` (no `interface`) para que admita la firma de índice
 * implícita y sea asignable a `Record<string, number>`.
 */
export type OcrConfidence = {
    amount: number;
    date: number;
    merchant: number;
    total: number;
};

/**
 * Respuesta del OCR. Refleja el modelo `OCRExtractionResult` del backend:
 * los campos dudosos llegan como `null`, nunca como cadena vacía.
 */
export interface OcrExtractionResult {
    amount: number | null;
    date: string | null;
    description: string | null;
    category: string | null;
    nature: string | null;
    merchant: string | null;
    merchant_raw: string | null;
    confidence: OcrConfidence | null;
    installments: OcrInstallments | null;
    items: OcrItem[] | null;
    subtotal: number | null;
    tax: number | null;
    discount: number | null;
    tip: number | null;
    duplicate: boolean;
    duplicate_of: string | null;
    image_hash: string | null;
    payment_method?: string | null;
}

/**
 * API de lectura de facturas por OCR.
 *
 * Los envíos son `multipart/form-data`, por eso usan `fetchWithAuthFormData`
 * (no fija `Content-Type` para que el navegador añada el boundary).
 */
export const ocrApi = {
    /** Extrae una factura. */
    extract: async (file: File): Promise<OcrExtractionResult> => {
        const formData = new FormData();
        formData.append('file', file);
        return fetchWithAuthFormData("/api/ocr/extract", formData);
    },

    /** Extrae varias facturas en paralelo (el backend las limita a 3 a la vez). */
    extractBulk: async (files: File[]): Promise<OcrExtractionResult[]> => {
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        return fetchWithAuthFormData("/api/ocr/extract-bulk", formData);
    },
};
