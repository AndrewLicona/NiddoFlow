# Contrato: "Impacto al borrar una categoría" (reemplaza al 409 opaco)

## Por qué

Hoy, borrar una categoría con deudas asociadas falla con **409** y un mensaje
genérico ("la categoría está siendo usada por otros registros"). El usuario
no puede ver **qué** registros quedan afectados ni **reasignarlos** antes de
borrar. Peor: una deuda sin categoría sigue siendo una deuda válida, así que
el bloqueo no protege nada.

La solución tiene dos partes:

1. **Nunca bloquear.** `debts.category_id` pasa a `ON DELETE SET NULL` (igual
   que `budgets`, `transactions` y `transaction_items`). Nada de historial se
   pierde; solo se desvincula.
2. **Mostrar y permitir reasignar.** Antes de borrar, el usuario ve el detalle
   exacto de lo afectado y puede moverlo a otra categoría.

---

## 1. Contrato HTTP (obligatorio para backend y frontend)

### `GET /categories/{category_id}/impact`

Devuelve el detalle de lo que usa esa categoría. **No escribe nada.**

```jsonc
{
  "category": { "id": "uuid", "name": "Comida", "type": "expense" },
  "counts": {
    "transactions": 12,
    "budgets": 1,
    "items": 34,
    "debts": 2
  },
  "transactions": [
    { "id": "uuid", "description": "Compra en el super", "amount": 45000.0,
      "date": "2026-10-20", "type": "expense" }
  ],
  "budgets": [
    { "id": "uuid", "amount": 200000.0, "period": "monthly",
      "month": 10, "week_number": null, "year": 2026, "user_id": null }
  ],
  "items": [
    { "id": "uuid", "transaction_id": "uuid", "item_name": "Leche",
      "quantity": 2.0, "total_price": 9800.0,
      "transaction_description": "Compra en el super" }
  ],
  "debts": [
    { "id": "uuid", "description": "Prestamo del banco",
      "total_amount": 500000.0, "remaining_amount": 200000.0,
      "type": "to_pay", "due_date": "2026-11-01" }
  ]
}
```

Reglas:
- Las listas vienen **ordenadas** por fecha/importe descendente y **truncadas a
  50** elementos cada una. `counts` siempre trae el total real (aunque la lista
  esté truncada).
- Si `transaction_items.category_id` todavía no existe (migración no aplicada),
  `items` va vacío y `counts.items` = 0. **Nunca revienta.**
- `budgets` no tiene columna `name`: el nombre de la categoría se conoce por
  la ruta. `period` es `"weekly"` o `"monthly"`.

### `PATCH /categories/{category_id}/reassign`

Body: `{ "target_category_id": "uuid" }`

Mueve **todos** los registros afectados a la categoría destino y devuelve:

```jsonc
{ "moved": { "transactions": 12, "budgets": 1, "items": 34, "debts": 2 } }
```

Reglas:
- La categoría origen debe ser propia de la familia del usuario (403 si es
  `is_default` o de otra familia).
- La categoría destino debe ser **visible** para el usuario (por defecto o de
  su familia) y de **compatible tipo**: no se puede mover un gasto a una
  categoría de ingreso ni al revés (400).
- Mover a la misma categoría es un no-op (400 con mensaje claro).
- Solo se mueve lo que realmente apuntaba a la origen.

### `DELETE /categories/{category_id}` (respuesta extendida, retrocompatible)

La respuesta actual **se mantiene** y se enriquece:

```jsonc
{
  "deleted": true,
  "warnings": {
    "transactions_affected": 12,
    "budgets_affected": 1,
    "items_affected": 34,
    "debts_affected": 2,
    "message": "Los movimientos quedaran sin categoria. El presupuesto se conservara sin categoria. ...",
    "affected": {
      "transactions": [ ... ],
      "budgets": [ ... ],
      "items": [ ... ],
      "debts": [ ... ]
    }
  }
}
```

- `affected` usa **exactamente** la misma forma que `GET /impact`.
- Las claves nuevas (`debts_affected`, `affected`) son aditivas: el frontend
  antiguo sigue funcionando.

---

## 2. Backend (agente A)

**Archivos que puedes tocar (y solo estos):**
- `backend/app/repositories/categories_repository.py`
- `backend/app/services/categories_service.py`
- `backend/app/models/category.py`
- `backend/app/routers/category.py`
- `backend/tests/test_categories.py` (solo para ampliarlo)

**Prohibido tocar:** `supabase/**`, `backend/schema.prisma`, `frontend/**`,
cualquier otro archivo. La migración SQL la aplica el agente principal.

**Métodos a añadir en el repositorio** (todos toleran que la columna/tabla no
exista todavía, devolviendo lista vacía o 0, **sin reventar**):

| Método | Qué hace |
|---|---|
| `count_debts_by_category(category_id)` | nº de deudas que apuntan a la categoría |
| `list_transactions_by_category(category_id, limit=50)` | movimientos con `id, description, amount, date, type` |
| `list_budgets_by_category(category_id, limit=50)` | presupuestos con `id, amount, period, month, week_number, year, user_id` |
| `list_items_by_category(category_id, limit=50)` | productos con `id, transaction_id, item_name, quantity, total_price, transaction_description` |
| `list_debts_by_category(category_id, limit=50)` | deudas con `id, description, total_amount, remaining_amount, type, due_date` |
| `reassign_category(category_id, family_id, target_category_id)` | mueve transacciones, presupuestos, productos y deudas; devuelve el conteo de cada tipo |

**En el servicio:**

- `get_category_impact(user_id, category_id) -> dict` — valida permisos (403
  si es `is_default` o de otra familia) y devuelve el contrato de arriba.
- `reassign_category(user_id, category_id, target_category_id) -> dict` —
  valida origen y destino y devuelve `{ "moved": {...} }`.
- `delete_category(user_id, category_id) -> dict` — **además de lo que ya
  hace**, debe:
  1. Desvincular también las **deudas** (`debts.category_id = NULL`) con el
     mismo patrón defensivo que `_detach_transactions` / `_detach_items`:
     si la operación falla se registra un aviso y se sigue. Esto permite que
     el borrado funcione **aunque la migración con `SET NULL` todavía no esté
     aplicada**.
  2. Incluir `debts_affected` y el bloque `affected` en los `warnings`.

**Reglas de seguridad (no negociables):**
- `family_id` sale siempre del perfil del usuario.
- Nada de `DELETE` masivo: solo `UPDATE ... SET category_id = NULL` sobre filas
  filtradas por la categoría origen.
- Nunca reventar si una columna no existe (columnas nuevas = nullable).

**En el router:**
- `GET /{category_id}/impact` y `PATCH /{category_id}/reassign`.
  Ojo: `/rules` y `/{category_id}` conviven porque el parámetro es un UUID.
- Traducir los errores de dominio con el mismo helper `_raise_http_error` que
  ya usa el router: 400 (validación), 403 (permisos), 404 (no existe),
  409 (conflicto).

**En los modelos:** añadir los response models queNeeds el contrato
(`CategoryImpactResponse`, `CategoryReassignRequest`, `CategoryReassignResponse`).
`CategoryDeleteResponse.warnings` sigue siendo `dict` (ya es genérico), así que
no rompe nada.

**Tests:** amplía `backend/tests/test_categories.py` con:
- el impacto devuelve los conteos y las listas correctas;
- el borrado desvincula deudas y devuelve `debts_affected`;
- reasignar mueve los 4 tipos y rechaza un destino incompatible o de otra
  familia (403) o de tipo contrario (400).

---

## 3. Frontend (agente B)

**Archivos que puedes tocar (y solo estos):**
- `frontend/src/lib/api/categories.api.ts`
- `frontend/src/hooks/useCategories.ts`
- `frontend/src/app/settings/SettingsForm.tsx`

**Prohibido tocar:** `backend/**`, `supabase/**`, y cualquier otro archivo del
frontend. Si necesitas un componente nuevo, créalo dentro de
`frontend/src/app/settings/` y avisa en el informe.

**API (añadir a `categories.api.ts`):**
```ts
getCategoryImpact: (id: string) => fetchWithAuth(`/categories/${id}/impact`)
reassignCategory: (id: string, targetCategoryId: string) =>
    fetchWithAuth(`/categories/${id}/reassign`, {
        method: "PATCH",
        body: JSON.stringify({ target_category_id: targetCategoryId }),
    })
```

**Hooks (añadir a `useCategories.ts`):**
- `useCategoryImpact(categoryId)` → `useQuery` con
  `queryKey: ["categories", "impact", categoryId]`, `enabled: !!categoryId`.
- `useReassignCategory()` → `useMutation` que, al tener éxito, invalida
  `["categories"]` y `["categories", "impact", ...]`.

**UI en `SettingsForm.tsx` (pestaña Categorías):**

Hoy el flujo es: modal de confirmación → borra → modal de resultado con 3
números. El objetivo es que el modal de confirmación **muestre el detalle**.

Al pulsar "Eliminar" en una categoría propia:
1. Se abre el modal de confirmación y se pide el impacto
   (`useCategoryImpact`).
2. Mientras carga, muestra un spinner.
3. Muestra:
   - Un resumen por tipo: Movimientos, Presupuestos, Productos, Deudas
     (los 4, con su número). Hoy solo hay 3: **añade Deudas**.
   - Una lista **desplazable** con los registros afectados, agrupados por tipo,
     mostrando lo legible para una persona:
     - Movimiento: descripción, monto, fecha.
     - Presupuesto: monto, periodo (mensual/semanal), mes/año.
     - Producto: nombre del producto, cantidad, monto, y el movimiento al que
       pertenece.
     - Deuda: descripción, monto total, saldo pendiente, fecha de vencimiento.
   - Si la lista tiene más de 50 elementos, avisar de que se muestra un
     resumen (el backend ya trunca).
4. **Dos botones de acción** (además de "Cancelar"):
   - **"Eliminar y dejar sin categoría"** → borra (lo que ya hace hoy) y
     muestra el modal de resultado, ahora con los 4 números y el detalle.
   - **"Mover a otra categoría"** → abre un `<select>` con las categorías
     visibles del usuario (compatibles por tipo: solo gasto→gasto e
     ingreso→ingreso), llama `reassignCategory` y, si va bien, **vuelve a
     pedir el impacto** para que el usuario vea que ya no queda nada, y
     habilita "Eliminar" (o lo ejecuta directamente, según lo que se entienda
     mejor; **deja claro en la UI qué va a pasar**).
   - Si no hay nada afectado, el modal lo dice ("No hay registros usando esta
     categoría") y solo ofrece eliminar.

**Reglas de UI del proyecto:**
- Tokens: `bg-card`, `text-foreground`, `text-muted-foreground`, `rounded-2xl`,
  `border-foreground/10`.
- `lucide-react` para iconos. **No agregar dependencias.**
- Todo el texto en **español**.
- Los componentes existentes del proyecto: `Card`, `Button`, `Typography`,
  `PageHeader`. Revisa cómo se usan antes de inventar.
- `npx tsc --noEmit` debe dar exit 0 y `npm run lint` sin errores.

---

## 4. Criterios de aceptación

- [ ] `GET /categories/{id}/impact` devuelve el contrato exacto.
- [ ] `DELETE /categories/{id}` no falla nunca por deudas asociadas.
- [ ] `DELETE /categories/{id}` devuelve `debts_affected` y `affected`.
- [ ] `PATCH /categories/{id}/reassign` mueve los 4 tipos y valida el destino.
- [ ] La UI muestra los 4 tipos con su detalle y ofrece reasignar.
- [ ] `pytest` verde, `tsc --noEmit` exit 0, `npm run lint` sin errores.
- [ ] Cero borrados masivos: solo `UPDATE ... SET category_id = NULL` filtrado.
