/**
 * Utilidades de fecha y semana ISO 8601.
 *
 * La convención es la de ISO 8601: la semana empieza el lunes y la semana 1
 * es la que contiene el 4 de enero. Es la MISMA convención que usa el
 * backend (`backend/app/services/budget_period.py`), de modo que el scoping
 * de presupuestos semanales coincide en ambos extremos.
 */

/** Número de semana ISO de una fecha (1-53). */
export function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Año ISO de una fecha.
 *
 * Puede diferir del año calendario: las fechas del 1 al 3 de enero pueden
 * pertenecer a la semana 52 o 53 del año anterior. Para los presupuestos
 * semanales hay que guardar este año, no el calendario.
 */
export function getIsoYear(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    return d.getUTCFullYear();
}

/**
 * Lunes de la semana ISO `week` del año ISO `year`.
 *
 * Inverso exacto de `getWeekNumber`: si la semana no existe en ese año ISO
 * (la 53 solo existe en algunos años), se busca en los años vecinos.
 */
export function getStartOfWeek(week: number, year: number): Date {
    for (const candidateYear of [year, year - 1, year + 1]) {
        // La semana 1 es la que contiene el 4 de enero.
        const jan4 = new Date(candidateYear, 0, 4);
        const dayNum = jan4.getDay() || 7;   // 1 = lunes ... 7 = domingo
        const week1Monday = new Date(candidateYear, 0, 4 - (dayNum - 1));
        const result = new Date(week1Monday);
        result.setDate(week1Monday.getDate() + (week - 1) * 7);

        // Se acepta si la fecha resultante cae en la semana pedida.
        // Ojo: la semana 1 de un año puede empezar en diciembre del anterior,
        // así que no se exige que el AÑO ISO coincida.
        if (getWeekNumber(result) === week) {
            return result;
        }
    }

    // Último recurso: la semana que contiene el 1 de enero.
    const anchor = new Date(year, 0, 1);
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - (anchor.getDay() === 0 ? 6 : anchor.getDay() - 1));
    monday.setDate(monday.getDate() + (week - 1) * 7);
    return monday;
}

/** Domingo de la semana ISO `week` del año ISO `year`. */
export function getEndOfWeek(week: number, year: number): Date {
    const start = getStartOfWeek(week, year);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
}
