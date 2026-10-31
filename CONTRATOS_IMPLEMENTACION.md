# Contratos de Implementación — NiddoFlow (MULTI-AGENTE)

> **Este documento es la fuente de verdad para todos los agentes.**
> Cualquier nombre, ruta, columna o forma de respuesta que no esté aquí, el agente lo decide y lo reporta.
> Si dos agentes necesitan algo que no está aquí: **no lo inventen en silencio** — que lo propongan en su informe final.

---

## 0. Reglas de oro (NO negociables)

1. **Cero cambios destructivos.** Prohibido `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN TYPE`, `TRUNCATE`, `DELETE` masivo, o cambiar el tipo de una columna existente.
2. **SQL idempotente.** Todo DDL con `if not exists`: `create table if not exists`, `add column if not exists`, `create index if not exists`, `create or replace function`.
3. **Columnas nuevas siempre nullable** y con default seguro. Nunca `NOT NULL` en columnas nuevas sin default.
4. **FK siempre `on delete set null`** para columnas que apuntan a `categories`, `transactions`, `accounts`. Nunca `cascade` desde una tabla existente hacia `transactions`.
   - **Única excepción documentada**: `transaction_items.transaction_id → transactions(id) on delete cascade`. Las líneas de producto de una factura deben morir con su factura; sin cascada quedarían ítems huérfanos apuntando a un movimiento inexistente. No borra movimientos: solo los hijos de un movimiento que ya se está borrando. El test `test_migrations.py` la verifica de forma explícita (`CASCADE_ALLOWED`).
5. **Nada se borra automáticamente.** Todo borrado es explícito y el endpoint devuelve el detalle de lo afectado.
6. **La IA propone, el usuario confirma.** Patrón `propose_*`: devuelve una propuesta, jamás escribe directo.
7. **El servidor calcula, el cliente renderiza.**
8. **Idempotencia en endpoints de escritura**: `POST` de categorías/necessidades no debe fallar por duplicado → devolver el existente o 409 con mensaje claro.
9. **Patrón del proyecto (obligatorio)**: `Router → Service → Repository → DB`. Los routers solo validan y delegan.
10. **Idioma**: código, comentarios y strings de cara al usuario en **español**. Los nombres de identificadores en inglés (convención existente).

---

## 1. Ownership de archivos (NO compartir archivos entre agentes)

| Agente | Archivos que posee (exclusivos) |
|---|---|
| **A — Insights (backend)** | `backend/app/models/insights.py`, `backend/app/repositories/insights_repository.py`, `backend/app/services/insights_service.py`, `backend/app/routers/insights.py`, `backend/main.py` (solo la línea `include_router`) |
| **B — Categorías (backend)** | `backend/app/models/category.py`, `backend/app/models/transaction.py`, `backend/app/repositories/categories_repository.py`, `backend/app/services/categories_service.py`, `backend/app/routers/category.py` |
| **C — OCR (backend)** | `backend/app/services/ocr_service.py`, `backend/app/routers/ocr.py` |
| **D — IA/Chat (backend)** | `backend/app/services/chat_service.py`, `backend/app/routers/chat.py`, `backend/app/services/insights_service.py` *(solo lectura, NO editar — A es dueña)* |
| **E — Frontend: categorías y productos** | `frontend/src/lib/api/categories.api.ts`, `frontend/src/hooks/useCategories.ts`, `frontend/src/app/settings/SettingsForm.tsx`, `frontend/src/app/settings/actions.ts`, `frontend/src/app/transactions/actions.ts`, `frontend/src/app/transactions/new/TransactionFormClient.tsx`, `frontend/src/components/ui/organisms/OcrItemsEditor.tsx` (nuevo) |
| **F — Frontend: dashboard y módulos** | `frontend/src/app/dashboard/**`, `frontend/src/utils/analytics.ts`, `frontend/src/app/shopping/**` (nuevo), `frontend/src/app/goals/**` (nuevo), `frontend/src/components/ui/organisms/Navigation.tsx`, `frontend/src/lib/api/insights.api.ts` (nuevo), `frontend/src/hooks/useInsights.ts` (nuevo), `frontend/src/lib/api/shopping.api.ts` (nuevo), `frontend/src/hooks/useShopping.ts` (nuevo), `frontend/src/lib/api/goals.api.ts` (nuevo), `frontend/src/hooks/useGoals.ts` (nuevo) |
| **G — Esquema de datos** | `supabase/schema.sql`, `backend/schema.prisma`, `supabase/migrations/*.sql` (nuevos) |
| **H — Verificación** | `backend/tests/**` (nuevo), `scripts/verify_migrations.py` (nuevo) |

> **Si necesitas tocar un archivo de otro agente: NO lo toques.** Reporta el cambio requerido en tu informe final.

---

## 2. Contrato: `/insights` (dueño: A)

```
GET /insights/?scope=family|personal&month=YYYY-MM
Authorization: Bearer <supabase_jwt>
```
- `scope=family` (default): todas las cuentas de la familia (conjuntas + las personales del usuario).
- `scope=personal`: solo cuentas con `user_id = usuario`.
- `month=YYYY-MM` (default: mes actual).
- **Respuesta 200** (JSON):

```jsonc
{
  "month": "2026-10",
  "scope": "family",
  "totals": {
    "income": 5200000.0,
    "expense": 3180000.0,
    "balance": 2020000.0,
    "savings_rate": 38.8,
    "transaction_count": 47,
    "prev_month_expense": 2900000.0,
    "expense_trend_pct": 9.7          // (expense - prev) / prev * 100
  },
  "by_category": [
    { "category_id": "uuid|null", "category": "Alimentación", "amount": 840000.0,
      "pct_of_total": 26.4, "trend_vs_last_month": 12.1 }
  ],
  "by_member": [
    { "user_id": "uuid|null", "member": "Andrew Licona", "amount": 1420000.0, "transaction_count": 23 }
  ],
  "by_account": [
    { "account_id": "uuid", "account": "Principal", "type": "personal", "amount": 980000.0 }
  ],
  "budgets": [
    { "budget_id": "uuid", "category_id": "uuid", "category": "Alimentación",
      "amount": 1000000.0, "spent": 840000.0, "percent": 84.0,
      "status": "ok|warning|critical", "period": "monthly|weekly|biweekly|custom" }
  ],
  "top_merchants": [
    { "merchant": "Alquería La Esmeralda", "amount": 210000.0, "visits": 6 }
  ],
  "recurring": [
    { "merchant": "Netflix", "amount": 55000.0, "cadence": "weekly|biweekly|monthly|quarterly|yearly",
      "last_seen": "2026-10-02", "confidence": 0.92 }
  ],
  "anomalies": [
    { "kind": "category_spike|category_drop|budget_critical|unusual_amount",
      "category": "Transporte", "message": "Transporte lleva 62% más que el mes anterior", "severity": "info|warning|critical" }
  ],
  "cashflow": {
    "projected_end_of_month": 1480000.0,
    "daily_avg_spend": 103000.0,
    "days_of_expense_remaining": 14.2
  },
  "price_history": []   // lo puebla B/C; puede ir vacío
}
```

**Reglas de cálculo (obligatorias, son el bug D4):**
- `budgets[].spent` = gastos **exclusivamente del mes/semana del budget**, filtrando por `budget.month` + `budget.year` (o por semana si `period='weekly'`). **Replicar exactamente la lógica de `frontend/src/app/budgets/BudgetClient.tsx:130-160`** (lee `relevantTxs`). Verificar contra ese archivo antes de escribir.
- `totals` y `by_category` **siempre** acotados al mes.
- `by_member` usa `transactions.user_id` → `profiles.full_name`; si no hay perfil, `member = "Sin asignar"`.
- `recurring`: detección por comercio normalizado + monto estable + periodicidad. `confidence` 0–1. **Solo lectura, no escribe nada.**

**Relación con budgets:** un budget `period='monthly'` tiene `month` y `year`. Un budget `weekly` tiene `week_number`. Replicar la lógica de `BudgetClient.tsx` (que usa `getWeekNumber` de `frontend/src/utils/date.ts`).

---

## 3. Contrato: `/categories` (dueño: B)

### 3.1 Endpoints

```
GET    /categories/                  → 200 [CategoryResponse]   (ya existe, no romper)
POST   /categories/                  → 201 CategoryResponse
PATCH  /categories/{category_id}     → 200 CategoryResponse
DELETE /categories/{category_id}     → 200 { deleted: bool, warnings: {...} }
```

**Request POST:**
```jsonc
{ "name": "Alimentación", "type": "expense", "icon": "UtensilsCrossed" }
```
- `type` ∈ `"income" | "expense"` (los budgets y el dashboard asumen estos dos valores; **no agregar un tercer tipo**).
- `icon`: nombre de un icono de `lucide-react` (string). Opcional.

**Response CategoryResponse:**
```jsonc
{ "id": "uuid", "name": "Alimentación", "type": "expense", "icon": "UtensilsCrossed",
  "is_default": false, "family_id": "uuid" }
```

### 3.2 Reglas de negocio (CRÍTICAS)

- `family_id` se toma **SIEMPRE del perfil del usuario**. Nunca del body. (Anti-abuso multi-familia.)
- **No** se puede modificar ni borrar una categoría con `is_default = true` → `403`.
- Solo se puede modificar/borrar una categoría cuya `family_id` coincida con la del usuario → `403` si no.
- **Duplicados**: si ya existe (misma familia, mismo `type`, mismo `name` ignorando mayúsculas/espacios) → devolver `409` con el detalle de la existente.
- **Borrado**: `transactions.category_id` y `budgets.category_id` son `on delete set null` → no se pierde historial.
  - Pero `budgets` tiene `on delete cascade` en el schema actual (ver `backend/schema.prisma:137`) → **el agente G debe cambiarlo a `on delete set null`** para que borrar una categoría NO borre el presupuesto.
  - El `DELETE` debe responder con `warnings` detallando qué se perdería:
    ```jsonc
    { "deleted": true,
      "warnings": { "transactions_affected": 14, "budgets_affected": 1,
                    "items_affected": 42,
                    "message": "Los movimientos quedarán sin categoría. El presupuesto se conservará sin categoría." } }
    ```
- **Iconos**: validar que el nombre exista en `lucide-react` (lista cerrada). Si no existe → `null`, no error.

### 3.3 Categorías por defecto (sembrar — lo hace G, B no)

Faltan en `supabase/schema.sql` y son **exigidas por el código existente**:
`Salud`, `Otros`, `Préstamos Recibidos`, `Préstamos Otorgados`, `Deudas` (esta última solo expense; las demás según el mapa de keywords de `ocr_service.py:410-419`).

### 3.4 `CategoryMatcher` (lo necesita C)

El agente B implementa, en `backend/app/services/categories_service.py`, un método público:

```python
def match_category(self, raw_text: Optional[str], categories: List[dict]) -> Tuple[Optional[str], Optional[str]]:
    """Devuelve (category_id, matched_category_name).

    Orden de resolución:
      1. Reglas aprendidas (user_category_rules) → se consulta en el servicio, no aquí
      2. Coincidencia EXACTA (case-insensitive, sin tildes) con el nombre de la categoría
      3. Alias registrados para la categoría
      4. Normalización: sin tildes, singular/plural, preposiciones "de/la/el"
      5. Mapa de keywords (el que ya existe en ocr_service.py)
      6. Sin match → (None, None)
    NO inventes categorías que no estén en `categories`.
    """
```

El agente C lo consume: `matcher.match_category(texto_crudo, categorias_familia)`.

---

## 4. Contrato: OCR (dueño: C)

### 4.1 Request

```
POST /api/ocr/extract        (1 archivo)   → 200 OCRExtractionResult
POST /api/ocr/extract-bulk   (N archivos o ZIP) → 200 [OCRExtractionResult]
```

**Ambos endpoints AHORA requieren** `user: Depends(get_current_user)` (hoy NO lo tienen — es una fuga de seguridad, corrígelo).

El service debe recibir **las categorías de la familia del usuario**, no todas las globales. Hoy `ocr.py:28` hace `prisma.category.find_many()` sin filtro → fugas entre familias. Corregir a: `is_default == True OR family_id == <familia del usuario>`.

### 4.2 Response (OCRExtractionResult) — campos nuevos

```jsonc
{
  "amount": 190400.0,
  "date": "2026-10-28T12:00",
  "description": "Alquería La Esmeralda",
  "category": "Alimentación",          // debe ser EXACTO de la lista, o null
  "nature": "Gasto",

  "merchant": "Alquería La Esmeralda", // NUEVO: normalizado (sin SAS, SA, Ltda, etc.)
  "merchant_raw": "ALQUERIA LA ESMERALDA S.A.S.",  // NUEVO: tal como salió del recibo
  "confidence": { "amount": 0.95, "date": 0.88, "merchant": 0.91, "total": 0.95 },  // NUEVO
  "installments": {                    // NUEVO: null si no aplica
    "current": 2, "total": 3,
    "purchase_total_amount": 540000.0
  },
  "items": [
    { "item_name": "Leche entera 1L", "quantity": 2.0, "unit_price": 4200.0,
      "total_price": 8400.0,
      "category": "Alimentación",      // texto EXACTO de la lista de categorías, o null
      "category_id": "uuid|null",      // NUEVO: resuelto por el matcher
      "confidence": 0.90 }             // NUEVO
  ]
}
```

**Reglas:**
- `category` (nivel factura) y `items[].category` **deben ser exactos de la lista** o `null`. Nunca texto inventado. Si Gemini devuelve algo no válido → `null` + se conserva el texto crudo en un campo aparte.
- `amount` = **total final pagado**. Si hay cuotas, `amount` = valor de la cuota pagada y `installments.purchase_total_amount` = total de la compra.
- `confidence` por campo ∈ [0,1].

### 4.3 Mejoras obligatorias

| ID | Mejora |
|---|---|
| **O1** | **Multi-página**: hoy `ocr_service.py:519` hace `doc.load_page(0)` → solo página 1. Iterar TODAS las páginas del PDF y procesarlas (enviar varias imágenes a Gemini o unirlas en una sola imagen vertical). Una factura EPM/Claro tiene el total en la última página. |
| **O2** | **Cuotas**: detectar "cuota 2 de 3", "3 cuotas", "cuota mensual". Extraer `current`, `total`, `purchase_total_amount`. |
| **O3** | **Confianza** por campo (0–1). |
| **O4** | **Comercio normalizado**: quitar sufijos corporativos (S.A.S., S.A., Ltda, "LTDA", etc.), normalizar mayúsculas/espacios, Title Case. |
| **O5** | **Validación de categorías**: restringir en el prompt + validar contra la lista real + fallback `null`. |
| **O6** | **Duplicados**: calcular hash perceptual de la imagen + (merchant, fecha, total). Si coincide con una factura reciente → `duplicate: true` + `duplicate_of`. Revisar si existe forma de consultar transacciones recientes; si no, al menos calcular el hash y devolverlo (`image_hash`) para que el frontend/backend lo compare. |
| **O7** | **Subtotal/IVA/descuento/propina**: extraerlos por separado como campos nuevos opcionales (`subtotal`, `tax`, `discount`, `tip`). `amount` sigue siendo el total final. |
| **O8** | **Paralelismo en bulk**: hoy `ocr.py:47-78` es un `for` secuencial con `await`. Usar `asyncio.gather` con un `asyncio.Semaphore(3)` para no reventar el rate limit de Gemini. |
| **O9** | **Preprocesamiento de imagen** *(opcional, NO agregar dependencias)*: si `opencv` ya estuviera disponible se podría usar, pero **no agregar `opencv-python` a requirements.txt**. Dejar el improvement documentado, no implementado. |

### 4.4 Prompt

El prompt de Gemini debe:
- Listar explícitamente las categorías válidas y exigir `"<exactamente uno de: ...> o null"`.
- Pedir `merchant`, `installments`, `subtotal/tax/discount/tip`.
- Pedir `confidence` por campo.
- Mantener la rotación de claves y el fallback a Tesseract que ya existen (NO romperlos).

---

## 5. Contrato: IA / Chat (dueño: D)

### 5.1 Contexto real (arregla D1, D2, D3)

`get_user_financial_context` debe usar el servicio de insights del agente A (**solo lectura**) y producir un contexto con:
- totales del mes (ingresos, gastos, balance, tasa de ahorro),
- gasto por categoría,
- **gasto por miembro** (con nombre),
- **presupuestos con `spent` REAL** (nunca `$0`),
- recurrentes, deudas, top merchants.

**Invariante a testear**: el `spent` que ve la IA debe ser **igual** al que muestra `/budgets` para el mismo período. Si no coinciden, es un bug.

### 5.2 Tool calling

Implementar function calling de Gemini con estas tools **SOLO LECTURA**:

| Tool | Parámetros | Devuelve |
|---|---|---|
| `get_summary` | `scope`, `month` | totales |
| `get_spend_by_category` | `scope`, `month` | desglose |
| `get_spend_by_member` | `scope`, `month` | por miembro |
| `get_budget_status` | `scope`, `month` | gastado vs límite |
| `get_transactions` | `scope`, `month`, `category`, `member`, `min_amount`, `max_amount`, `limit` | movimientos |
| `get_debts` | `scope` | deudas |
| `get_recurring` | `scope` | recurrentes |
| `get_price_history` | `product` | historial de precios de un producto |

**Restricciones:**
- El `scope` lo decide el modelo según la pregunta ("¿gasté yo?" → `personal`; "¿gastamos?" → `family`).
- Todas pasan por el servicio de insights (agente A) o repositorios existentes. **Ninguna escribe.**
- Si el modelo pide una tool con parámetros inválidos → el handler devuelve un error suave, no una excepción 500.
- **Guardar el intercambio de tool calls** en `ai_chat_messages.tool_calls` (columna ya existe en Prisma).

### 5.3 Escritura con confirmación — patrón `propose_*`

NO hay tool de escritura directa. La respuesta del chat puede incluir **propuestas** que la UI renderiza con botón "Confirmar":

```jsonc
{
  "reply": "Registré la propuesta de gasto en cafés.",
  "proposals": [
    { "type": "transaction",
      "label": "Gasto · Café · $32.000 · Comida",
      "payload": { "description": "Café", "amount": 32000, "type": "expense",
                   "category_id": "uuid", "account_id": "uuid", "date": "2026-10-30" } }
  ]
}
```
- El frontend (agente E o F, según corresponda) muestra el botón. **El chat NUNCA escribe en `transactions` por su cuenta.**
- Esto se documenta como contrato; la UI de confirmación puede ser una fase posterior si el tiempo no alcanza (prioridad: que el backend expondrá `proposals` correctamente).

### 5.4 Memoria entre sesiones

`ai_chat_messages` se escribe pero **nunca se relee**. Al abrir una sesión, cargar los últimos N mensajes del usuario desde la tabla y usarlos como historial. Implementar en el service.

---

## 6. Contrato: esquema de datos (dueño: G)

### 6.1 `supabase/schema.sql` — sincronizar con `backend/schema.prisma`

Faltan 3 tablas en el SQL que SÍ existen en Prisma → crearlas:
- `transaction_items`
- `user_category_rules`
- `ai_chat_messages`

Además falta la función `get_dashboard_summary` (la usa `stats_repository.py:7` vía RPC). **Si no existe en la DB real, crearla** con una firma compatible; si no se puede determinar, **no inventarla**: dejarla anotada como pendiente en el informe.

### 6.2 Cambios de columnas (TODOS `if not exists`, TODOS nullable)

```sql
-- Categorías: jerarquía disponible pero NO se usa (decisión: plano)
alter table categories add column if not exists parent_id uuid references categories(id) on delete set null;

-- Índices de unicidad de categorías (por familia + tipo + nombre normalizado)
create unique index if not exists categories_family_name_type_uniq
  on categories (coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), type);

-- Productos de factura → categoría real
alter table transaction_items add column if not exists category_id uuid references categories(id) on delete set null;
alter table transaction_items add column if not exists confidence numeric;

-- Transacciones → comercio normalizado + cuotas
alter table transactions add column if not exists merchant text;
alter table transactions add column if not exists installment_current integer;
alter table transactions add column if not exists installment_total integer;
alter table transactions add column if not exists purchase_total_amount numeric;
alter table transactions add column if not exists image_hash text;

-- Importador bancario
alter table transactions add column if not exists import_hash text;
alter table transactions add column if not exists source text;   -- valores: manual|ocr|import
```

> **Nota**: `source` permite distinguir el origen de cada movimiento (manual, OCR o importador), lo que habilita el importador sin ambigüedad y el "duplicado" del OCR.

Índices recomendados (todos `if not exists`):
```sql
create index if not exists transactions_family_date_idx on transactions (family_id, date desc);
create index if not exists transactions_merchant_idx on transactions (merchant);
create index if not exists transaction_items_transaction_idx on transaction_items (transaction_id);
create index if not exists transaction_items_category_idx on transaction_items (category_id);
create index if not exists user_category_rules_lookup_idx on user_category_rules (user_id, merchant);
```

### 6.3 Cambios de FK (¡IMPORTANTE!)

```sql
-- budgets: cambiar cascade → set null para que borrar una categoría NO borre el presupuesto
-- (schema.prisma:137 hoy dice onDelete: Cascade)
```
En `backend/schema.prisma`, el modelo Budget debe quedar:
```prisma
category Category @relation(fields: [category_id], references: [id], onDelete: SetNull)
```
Y en SQL: `alter table budgets drop constraint if exists budgets_category_id_fkey; alter table budgets add constraint budgets_category_id_fkey foreign key (category_id) references categories(id) on delete set null;`

### 6.4 Tablas nuevas (aditivas)

**`shopping_items`** (necesidades / lista de compra):
```sql
create table if not exists shopping_items (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  category_id uuid references categories(id) on delete set null,
  quantity numeric default 1,
  estimated_price numeric,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'pending' check (status in ('pending','purchased','skipped')),
  purchase_transaction_id uuid references transactions(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  purchased_at timestamptz
);
create index if not exists shopping_items_family_status_idx on shopping_items (family_id, status);
```

**`savings_goals`**:
```sql
create table if not exists savings_goals (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  saved_amount numeric not null default 0,
  target_date date,
  category_id uuid references categories(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
```

**`recurring_bills`** (cuentas por pagar del hogar):
```sql
create table if not exists recurring_bills (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  amount numeric not null,
  category_id uuid references categories(id) on delete set null,
  cadence text not null default 'monthly' check (cadence in ('weekly','biweekly','monthly','quarterly','yearly')),
  day_of_month integer,
  next_due_date date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
```

### 6.5 `user_category_rules` — activar

Ya está en Prisma pero no en el SQL. Crearla con `family_id` y agregar política RLS:
```sql
create table if not exists user_category_rules (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  raw_keyword text not null,
  category text not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);
create unique index if not exists user_category_rules_uniq
  on user_category_rules (user_id, merchant, raw_keyword);
alter table user_category_rules enable row level security;
create policy "Allow all for authenticated" on user_category_rules for all using (auth.role() = 'authenticated');
```

### 6.6 Categorías por defecto — sembrar las que faltan

```sql
insert into categories (name, type, is_default) values
  ('Salud', 'expense', true),
  ('Otros', 'expense', true),
  ('Préstamos Recibidos', 'income', true),
  ('Préstamos Otorgados', 'expense', true),
  ('Deudas', 'expense', true)
on conflict do nothing;
```
> `on conflict do nothing` solo funciona si hay un índice único que genere conflicto. El índice `categories_family_name_type_uniq` NO cubre `family_id = NULL` con `coalesce(...)` de forma que `on conflict do nothing` lo detecte... **Verificar**: `coalesce(family_id, '000...')` SÍ produce el mismo valor para los NULL, así que el índice único sí los colisiona. Confirmar con un test que no se dupliquen al reejecutar.

### 6.7 RLS

Toda tabla nueva necesita:
```sql
alter table <tabla> enable row level security;
create policy "Allow all for authenticated" on <tabla> for all using (auth.role() = 'authenticated');
```

### 6.8 Migración

Crear `supabase/migrations/20261030_improvements.sql` con **TODO** el DDL de arriba, en orden, idempotente. `supabase/schema.sql` debe quedar sincronizado con el mismo contenido (olopiar las statements del archivo de migración).

---

## 7. Contrato: endpoints nuevos de módulos (dueño: F para frontend, backend lo implementa quien corresponda)

> **Nota de ownership:** los routers backend de `shopping`, `goals` y `recurring_bills` no tienen dueño asignado en la tabla de la §1. Los asigno así:
> - **`shopping`** → agente **E** (porque está tightly coupled con items/productos)
> - **`goals`** → agente **B** (misma familia de categorías/budgets)
> - **Los routers nuevos deben vivir en archivos nuevos**, no en routers existentes de otro agente.

### 7.1 `/shopping`
```
GET    /shopping/?scope=family|personal&status=pending
POST   /shopping/            { name, category_id, quantity, estimated_price, priority, notes }
PATCH  /shopping/{id}        { ...campos editables, o status }
DELETE /shopping/{id}
POST   /shopping/{id}/purchase   { account_id, amount, date } → crea la transacción y marca comprado
```
Al comprar: crea la transacción con la categoría de la necesidad, la marca `purchased` y setea `purchase_transaction_id`.

### 7.2 `/goals`
```
GET    /goals/
POST   /goals/          { name, target_amount, target_date, category_id }
PATCH  /goals/{id}     { name, target_amount, saved_amount, target_date }
DELETE /goals/{id}
POST   /goals/{id}/contribute   { amount, account_id } → suma a saved_amount
```

---

## 8. Reglas de código frontend

- **React Query** para todo fetching remoto. **Nunca** `fetch` directo dentro de un componente (regla de `refactor.md`).
- Hooks en `frontend/src/hooks/use*.ts`, API en `frontend/src/lib/api/*.api.ts`.
- Los componentes de UI en `frontend/src/components/ui/{atoms,molecules,organisms}/`.
- **Tailwind v4** + tokens del proyecto (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-foreground/10`, `rounded-2xl`, etc.). Reutilizar `<Typography>`, `<Button>`, `<Card>`, `<PageHeader>`, `<InputField>`.
- Iconos: `lucide-react` (ya instalado, v0.562). **No agregar dependencias.**
- Dark mode: usar tokens, no colores hardcodeados. Si hace falta color de acento, usar `text-blue-500` / `text-rose-500` / `text-emerald-500` como ya hace el resto del proyecto.
- Idioma de la UI: **español**.
- `npx tsc --noEmit` debe quedar en **exit 0**.

---

## 9. Verificación (H)

`backend/tests/` con **pytest**. Agregar `pytest` y `pytest-asyncio` a `backend/requirements.txt` (como `pytest` en requirements y `pytest-asyncio`).

Tests obligatorios:
1. `test_insights_contract.py` — totales, by_category, by_member, budgets (con scoping por mes — el bug D4), recurrent, cashflow.
2. `test_categories.py` — CRUD, permisos (no tocar default, no tocar otra familia), duplicados → 409, delete devuelve warnings, `family_id` siempre del perfil, reglas aprendidas por usuario.
3. `test_category_matcher.py` — `match_category`: exacto, con tildes, singular/plural, alias, sin match.
4. `test_ocr_contract.py` — validación del contrato de `OCRExtractionResult` (mockear la extracción, no llamar a Gemini).
5. `test_chat_contract.py` — que el contexto incluye categorías, miembros y `spent` real.
6. `test_migrations.py` — que los DDL son idempotentes, que no hay `DROP`/`TRUNCATE`, que toda tabla nueva tiene RLS, y que las FKs hacia `transactions`/`categories` no borran en cascada.
7. `test_safety.py` — que ningún borrado queda sin acotar (id + familia), que la IA no escribe, que el importador no borra y que no se arma SQL con texto interpolado.

Además: `scripts/verify_migrations.py` que escanea los `.sql` y falla si encuentra `drop table`, `truncate`, `delete from` sin `where`.

---

## 10. Reglas para los agentes

1. **Lee `CONTRATOS_IMPLEMENTACION.md` completo antes de escribir código.**
2. **No toques archivos de otros agentes.**
3. Si necesitas algo que no está en el contrato: **impleméntalo de forma razonable y repórtalo** en el informe final. No bloquees el trabajo por ello.
4. **Reporta en tu informe final**: archivos creados/modificados, decisiones tomadas, desviaciones del contrato, y **cómo verificar cada cosa** (comando exacto).
5. **Verifica tu propio trabajo antes de reportar**: `npx tsc --noEmit` para frontend; `pytest` para backend.
6. **No hagas commit.** El control de versiones lo maneja el agente principal.
7. Errores de red, de Supabase o de Gemini **nunca** deben romper el flujo: envolver en try/except y devolver un fallback seguro.
