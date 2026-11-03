/**
 * Utilidades numericas de NiddoFlow.
 *
 * Criterio de precision:
 * - Cantidades (litros, kilos, unidades): 3 decimales. El OCR devuelve
 *   valores reales como 1.234 L o 0.333 kg. Con `step="0.01"` en un
 *   <input type="number"> el navegador marca el campo como invalido y
 *   BLOQUEA el guardado del formulario completo, obligando a escribir
 *   a mano el valor con solo 2 decimales.
 * - Dinero (precio unitario, total de linea): 2 decimales.
 *
 * El backend y la base de datos guardan Float sin truncar, asi que el
 * redondeo es solo de presentacion/validacion en el formulario.
 */

/** Decimales admitidos para cantidades. */
export const QUANTITY_DECIMALS = 3;

/** Decimales admitidos para dinero. */
export const MONEY_DECIMALS = 2;

/** Valor del atributo `step` para inputs de cantidad. */
export const QUANTITY_STEP = '0.001';

/** Valor del atributo `step` para inputs de dinero. */
export const MONEY_STEP = '0.01';

/**
 * Redondea a un numero fijo de decimales evitando el error binario
 * clasico (1.005 * 100 = 100.49999999999999 -> 1.00 en vez de 1.01).
 */
export function roundTo(value: number, decimals: number): number {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Cantidad redondeada a 3 decimales. */
export const roundQuantity = (value: number): number => roundTo(value, QUANTITY_DECIMALS);

/** Dinero redondeado a 2 decimales. */
export const roundMoney = (value: number): number => roundTo(value, MONEY_DECIMALS);

/**
 * Convierte cualquier entrada a numero finito.
 * Devuelve `fallback` si no se puede interpretar como numero.
 */
export function toNumber(value: unknown, fallback = 0): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Cantidad válida para un input de cantidad: positiva y con 3 decimales.
 * Si el usuario escribe mas decimales, se redondea en lugar de invalidar
 * el formulario.
 */
export function normalizeQuantity(value: unknown, fallback = 1): number {
    const parsed = toNumber(value, fallback);
    if (parsed <= 0) return fallback;
    return roundQuantity(parsed);
}

/**
 * Formatea una cantidad para mostrar en la interfaz, quitando los ceros
 * decimales sobrantes (1.500 -> "1.5", 2.000 -> "2").
 */
export function formatQuantity(value: number): string {
    if (!Number.isFinite(value)) return '0';
    return String(roundQuantity(value));
}
