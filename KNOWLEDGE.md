# NiddoFlow - Reglas de Negocio y Lógica del Sistema

Este documento sirve como referencia para entender cómo funciona la lógica interna de NiddoFlow, especialmente en lo que respecta a transacciones, préstamos y flujos de dinero.

---

## 🏗️ Estructura de Datos Principal

### 1. Transacciones (`transactions`)
Son los movimientos de dinero individuales.
- **Tipos:**
  - `income` (Ingreso): Suma al balance de la cuenta.
  - `expense` (Egreso): Resta al balance de la cuenta.
  - `transfer` (Transferencia): Resta de la cuenta origen (`account_id`) y suma a la cuenta destino (`target_account_id`).
- **Impacto:** Cualquier creación, edición o eliminación de una transacción recalcula automáticamente el balance de la(s) cuenta(s) involucrada(s).
- **Origen (`source`):** `manual` (registro a mano), `ocr` (escaneo de factura) o `import` (importador bancario). Permite distinguir el origen sin duplicar movimientos.
- **Comercio (`merchant`):** Nombre normalizado del comercio (sin sufijos corporativos). Es la llave para aprender reglas de clasificación.
- **Cuotas (`installment_current`, `installment_total`, `purchase_total_amount`):** Cuando la compra fue a cuotas, `amount` es el valor de la cuota pagada y `purchase_total_amount` el total de la compra. Así el flujo de caja del mes no se confunde con el gasto real.

### 2. Productos de factura (`transaction_items`)
Cada línea de producto de una factura escaneada.
- **Categorización:** `category_id` apunta a una categoría real (`categories.id`, `on delete set null`); `category` conserva el texto crudo que devolvió el OCR como respaldo y como insumo para aprender reglas.
- **Confianza:** `confidence` (0-1) por línea. Por debajo de 0.6 la interfaz la marca para revisión.
- **Nunca se pierde información:** al borrar una categoría, `category_id` queda en `null` pero la línea y su etiqueta cruda sobreviven.

### 3. Préstamos (`debts`)
Representan deudas o dinero por cobrar.
- **Tipos:**
  - `to_pay` (Por pagar / Préstamo Recibido): Es una **entrada** de dinero inicial.
  - `to_receive` (Por cobrar / Préstamo Otorgado): Es una **salida** de dinero inicial.
- **Lógica Automática:**
  - Al crear un préstamo y asociarlo a una cuenta, el sistema crea **automáticamente** una transacción inicial para reflejar el movimiento de dinero.
  - Si es `to_pay`, se crea un ingreso (`income`).
  - Si es `to_receive`, se crea un egreso (`expense`).
- **Categorías por defecto:**
  - Se usan las categorías "Préstamos Recibidos" o "Préstamos Otorgados" si el usuario no elige una.

### 4. Categorías (`categories`)
- **Globales:** `is_default = true` y `family_id` nulo. Están disponibles para todos y **no se pueden editar ni borrar**.
- **Propias:** `family_id` apunta a la familia. Cada familia puede crear las suyas desde Ajustes → Categorías.
- **Unicidad:** no puede haber dos categorías iguales (misma familia, mismo tipo, mismo nombre sin tildes ni mayúsculas).
- **`parent_id`:** existe para permitir jerarquías, pero la app opera **plana**. Los presupuestos y los gráficos comparan por igualdad exacta.
- **Borrar una categoría** nunca borra historial: las transacciones y los productos quedan sin categoría (`set null`) y los presupuestos se conservan.

### 5. Necesidades (`shopping_items`)
Lo que el hogar **todavía no tiene**: "me falta leche", "necesito detergente".
- **Estados:** `pending` (pendiente), `purchased` (comprado), `skipped` (descartado).
- **Categoría:** apunta a una categoría de gasto, así se sabe a qué presupuesto va a impactar.
- **Al comprarlo** se crea la transacción correspondiente y se guarda el `purchase_transaction_id`. El ciclo queda cerrado:
  `Necesidad → Compra → Factura → Producto clasificado → Categoría → Presupuesto → Dashboard`.

### 6. Cuentas del hogar (`recurring_bills`)
Compromisos que se repiten: arriendo, luz, seguro, universidad.
- **Cadencia:** `weekly`, `biweekly`, `monthly`, `quarterly`, `yearly`.
- Se normalizan a costo mensual (`monthly_equivalent`) para poder sumarlos.
- **Son distintas de `debts`**: `debts` son deudas con personas; `recurring_bills` son servicios del hogar.

---

## 👪 Alcance y Visibilidad (Scoping)

NiddoFlow maneja dos niveles de visibilidad:
- **Personal:** Solo muestra transacciones de las cuentas personales del usuario logueado.
- **Familiar:** Muestra:
  1. Todas las cuentas marcadas como "familiares/conjuntas".
  2. Las cuentas personales del usuario logueado.
  3. **Todas las transferencias** de la familia (para auditoría).
  *No muestra las cuentas personales de otros miembros de la familia.*

El mismo criterio se usa en `/insights`, en `/budgets`, en el chat con IA y en el importador. **Si un dato es de la familia, es de la familia; no depende de la pantalla desde la que se mire.**

---

## 🧠 La capa de agregación (`/insights`)

**Regla de oro: el servidor calcula, el cliente renderiza.**

Todo lo que aparece en más de una pantalla se calcula en `GET /insights/?scope=family|personal&month=YYYY-MM`:
totales, gasto por categoría, gasto por miembro, gasto por cuenta, presupuestos con lo gastado, comercios top, gastos recurrentes, anomalías y proyección de flujo de caja.

- Si un cálculo aparece en dos pantallas, va al servidor. Antes se calculaba en el navegador y el dashboard y la página de presupuestos **daban números distintos**.
- El chat con IA consume **la misma capa**, por eso responde con los mismos números que la pantalla.

### Cómo se calcula lo gastado de un presupuesto
Vive en `backend/app/services/budget_period.py` y es la **única fuente de verdad**:
1. Si el presupuesto tiene `start_date` y `end_date` → ese rango.
2. Si es `period='weekly'` → la semana ISO correspondiente.
3. Si no → mes y año del presupuesto.

Además: solo cuentan los gastos (`type='expense'`), solo los de la categoría del presupuesto, y si el presupuesto es personal (`user_id`) solo los movimientos de ese miembro.

### Semana ISO 8601
La semana empieza el lunes y la semana 1 es la que contiene el 4 de enero. El backend (`app/services/budget_period.py`) y el frontend (`frontend/src/utils/date.ts`) aplican **exactamente la misma** convención; hay una verificación cruzada en `backend/tests/verify_iso_week.py` que las compara contra `datetime.isocalendar` de 2018 a 2030.

> Para presupuestos semanales se guarda el **año ISO**, que puede diferir del calendario en los primeros días de enero.

---

## 🧾 OCR de facturas

- **Multi-página:** los PDF se procesan página por página (hasta 5). Una factura de EPM o Claro tiene el total en la última y antes se perdía.
- **Cuotas:** se detecta "cuota 2 de 3" y se separa el valor de la cuota del total de la compra.
- **Comercio normalizado:** se quitan sufijos corporativos (S.A.S., Ltda, E.U.) para poder aprender reglas.
- **Categorías validadas:** el modelo solo puede devolver categorías que existen en la lista real. Si inventa una, queda en `null` y el texto crudo se conserva. **Nunca se crean categorías fantasma.**
- **Confianza:** cada campo y cada producto llevan su confianza (0-1). Por debajo de 0.6 la interfaz lo marca.
- **Duplicados:** se calcula una huella de la imagen y se avisa si la factura ya fue registrada.
- **Aislamiento:** los endpoints requieren autenticación y solo ven las categorías de la familia del usuario.

### Aprendizaje de reglas
Cuando el usuario corrige la categoría de un producto, se guarda una regla `(usuario, comercio, palabra) → categoría`. Las reglas se aplican **antes** de llamar a la IA, así que la respuesta se vuelve más consistente con el uso y más barata. La tabla es `user_category_rules`.

---

## 🤖 NiddoAI (chat con IA)

- **Contexto real:** la IA ve totales, gasto por categoría, gasto por miembro, presupuestos con lo gastado real, recurrentes y deudas. Antes no veía categorías y siempre creía que los presupuestos estaban en $0.
- **Herramientas de solo lectura:** la IA consulta los datos ella misma en lugar de adivinar. Ninguna escribe.
- **Alcance automático:** "¿gasté yo?" → `personal`; "¿gastamos?" → `family`.
- **Nunca escribe:** si pide registrar algo, la IA devuelve una **propuesta** (`proposals`) y la interfaz muestra un botón "Confirmar". El usuario confirma; la IA no decide.
- **Memoria:** el historial se guarda en `ai_chat_messages` y se recupera entre sesiones.

---

## 🏦 Importador de movimientos bancarios

Flujo de **dos pasos** para que nada se escriba sin querer:
1. `POST /import/preview` analiza el archivo y **no escribe nada**. Detecta duplicados y conflictos.
2. `POST /import/commit` crea **solo** las filas que el usuario confirmó.

- Formatos: CSV (con autodetección de columnas) y OFX/QFX.
- **Nunca borra:** un movimiento que no aparece en el archivo del banco se reporta para revisión manual, pero no se elimina.

---

## 📊 Exportación y Reportes
- El sistema permite exportar un historial en **PDF** con filtrado por fechas, alcance (Personal/Familiar), categoría, integrante, tipo y rango de monto.
- Los recibos (imágenes/archivos) se almacenan en el storage de Supabase y el PDF incluye enlaces directos a ellos.

---

## 🛠️ Mantenimiento de Base de Datos
- Las categorías globales (`is_default = true`) no tienen `family_id` y están disponibles para todos.
- Al limpiar la base de datos, siempre se deben restaurar las categorías base para que la aplicación sea funcional desde el inicio.
- **Todas las migraciones son idempotentes** (`if not exists`) y **aditivas**. Nunca se hace `DROP TABLE`, `TRUNCATE` ni se cambia el tipo de una columna existente.
- Las claves foráneas nuevas usan `on delete set null` para que borrar una categoría nunca destruya historial.
- `supabase/schema.sql` y `backend/schema.prisma` deben estar sincronizados: si se toca uno, se toca el otro.
- `scripts/verify_migrations.py` falla si encuentra SQL destructivo o falta RLS en una tabla nueva.
- `scripts/verify_db_state.py` audita la **base real** (solo lectura): artefactos
  de prueba abandonados, RLS completa, acciones de las FKs y referencias
  huérfanas. Ejecútalo después de cada migración.
- `scripts/audit_writes.py` inventaría **todas** las escrituras del backend
  (`update`/`delete`) y falla si alguna no está acotada por id/familia. Un
  `UPDATE` sin filtro es tan peligroso como un `DELETE` masivo.
- `scripts/verify_schema_in_docker.py` levanta un Postgres **desechable** en
  Docker, aplica `schema.sql` y las migraciones **dos veces** (para demostrar
  la idempotencia) y destruye todo al terminar. Deja cero rastro: ni
  contenedor ni volúmenes.
- `supabase/schema.sql` y `backend/schema.prisma` deben estar sincronizados: si se toca uno, se toca el otro.

---

## 🛡️ Invariantes que vigilan los tests

Los tests no solo comprueban functionality: **vigilan las reglas de seguridad**.
Si alguien rompe una de ellas, la suite falla.

| Test | Qué vigila |
|---|---|
| `backend/tests/test_safety.py` | Que todo borrado esté acotado a id + familia; que la IA no escriba; que el importador no borre; que no se arme SQL con texto interpolado. Lee el código con `ast`, no toca la base de datos. |
| `backend/tests/test_migrations.py` | Que el SQL no tenga DDL destructivo, que todo sea idempotente, que cada tabla nueva tenga RLS + política, y que las FKs hacia `transactions`/`categories` no borren en cascada. |
| `backend/tests/test_categories.py` | Que `family_id` salga siempre del perfil, que no se toquen categorías por defecto ni de otra familia, y que al borrar una categoría se desvincula el historial en vez de borrarlo. |

Los scripts de `backend/tests/manual/` tocan la **base de datos real** y exigen
`NIDDOFLOW_ALLOW_DB_TESTS=1` para ejecutarse. Además, la limpieza está acotada
a lo que el propio test creó.

---

## 🔐 Invariantes de seguridad
- Todo endpoint de escritura recibe `family_id` **del perfil del usuario**, nunca del cuerpo de la petición.
- `DELETE` sobre datos existentes siempre es explícito y devuelve el detalle de lo que se va a afectar.
- La IA no tiene herramientas de escritura: solo propone.
- El importador no borra: solo crea lo confirmado.
- **Borrar una categoría nunca se bloquea.** Todas sus referencias están en
  `on delete set null`: `budgets`, `transactions`, `transaction_items` y
  `debts`. Una deuda sin categoría sigue siendo una deuda válida.
  Antes de borrar, `GET /categories/{id}/impact` devuelve el detalle de lo
  afectado (movimientos, presupuestos, productos y deudas) y
  `PATCH /categories/{id}/reassign` permite moverlo a otra categoría.

---

## 🌐 Contrato del frontend (React Query)

Todo el acceso a datos vive en dos capas y **nunca dentro de un componente**
(regla de `refactor.md`):

```
frontend/src/lib/api/*.api.ts   -> funciones que llaman al backend
frontend/src/hooks/use*.ts      -> hooks de React Query (useQuery / useMutation)
frontend/src/components/**      -> solo renderizan
```

| Dominio | API | Hook |
|---|---|---|
| Transacciones | `transactions.api.ts` | `useTransactions` |
| Categorías | `categories.api.ts` | `useCategories` |
| Insights | `insights.api.ts` | `useInsights` |
| Metas | `goals.api.ts` | `useGoals` |
| Lista de compra | `shopping.api.ts` | `useShopping` |
| Cuentas del hogar | `recurringBills.api.ts` | `useRecurringBills` |
| Importador | `import.api.ts` | `useImport` |
| Chat con IA | `chat.api.ts` | `useChat` |
| OCR | `ocr.api.ts` | `useOcr` |
| Categoría de producto | `transactions.api.ts` | `useItemCategories` |

Excepciones permitidas y por qué:
- **Server Components** (`page.tsx` sin `'use client'`): pueden usar `fetch`
  directo porque corren en el servidor y usan el token de la sesión.
- **Subida de archivos** (`ocr.api.ts`): usa `fetchWithAuthFormData`, que **no**
  fija `Content-Type` para que el navegador añada el `boundary` del multipart.
- **Descargas binarias** (exportación a PDF): usa `fetchWithAuthRaw`, que
  devuelve la `Response` cruda porque el cuerpo no es JSON.
- El estado que depende de una respuesta del servidor (por ejemplo, el
  historial del chat) se **deriva durante el render** con `useMemo`, no se
  copia a un estado dentro de un `useEffect`.
