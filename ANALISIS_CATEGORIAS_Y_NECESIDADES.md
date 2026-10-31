# Análisis: Categorías, Categorización de Productos y Control de Necesidades

> Documento de análisis técnico previo a implementación.
> Stack: Next.js 16 (App Router) + FastAPI + Supabase (Postgres) + Prisma-Python.
> Convención del proyecto respetada: `Router → Service → Repository → DB` y hooks en frontend.

---

## 1. Resumen ejecutivo

La buena noticia: **las tres funcionalidades pedidas ya están soportadas por el modelo de datos en un 80–90 %**. El backend ya tiene las piezas; lo que falta es (a) el camino de escritura de categorías personalizadas, (b) que el frontend deje de **descartar la lista de productos** que el OCR ya devuelve, y (c) un dominio nuevo para "cosas que necesito".

| # | Funcionalidad | Estado real | Esfuerzo estimado |
|---|---|---|---|
| 1 | Producto → categoría específica | Backend listo, **frontend descarta los items** | Medio (2–3 días) |
| 2 | Categorías propias | Esquema listo, **falta API de escritura + UI** | Bajo–medio (1–2 días) |
| 3 | Control de "cosas que necesito" | **No existe** (dominio nuevo) | Medio (3–4 días) |
| 0 | Correcciones previas (bugs + drift de esquema) | — | Bajo (0.5–1 día) |

**Recomendación central:** el alma de las tres es la **misma tabla `categories`**. En vez de inventar tres mecanismos, se hace que `categories` sea el eje:

- Las **categorías propias** se crean por familia (la tabla ya tiene `family_id`).
- Los **productos de una factura** apuntan a una categoría vía FK real (hoy es texto libre).
- Una **necesidad** ("me falta leche") apunta también a una categoría → así se sabe a qué **presupuesto** va a impactar cuando la compres.

Con eso, el ciclo completo queda cerrado:

```
Necesidad → Compra → Factura escaneada → Producto clasificado → Categoría → Presupuesto → Dashboard
```

---

## 2. Estado actual (mapa de lo que existe)

### 2.1 Modelo de datos

`backend/schema.prisma` es la fuente real del ORM. `supabase/schema.sql` es el script de despliegue.

**`categories`** — ya soporta lo que pides:

| Columna | Significado | Nota |
|---|---|---|
| `id` | UUID | PK |
| `name` | Nombre | Sin constraint de unicidad |
| `type` | `income` \| `expense` | CHECK constraint, **solo 2 valores** |
| `icon` | TEXT | **Nunca leído por el frontend** — columna muerta |
| `is_default` | bool | `true` = global, `family_id` NULL |
| `family_id` | UUID nullable | NULL = global por defecto |

**`transactions`** — `category_id uuid references categories(id) on delete set null`. Correcto.

**`transaction_items`** — líneas de producto de la factura:
```prisma
item_name  String
quantity   Float
unit_price Float
total_price Float
category   String?      // ← TEXTO LIBRE, no es FK  ⚠️
```

**`user_category_rules`** — `(user_id, merchant, raw_keyword) → category`. **Tabla muerta**: existe en Prisma, **no aparece en `schema.sql`** y **cero referencias en el código** (verificado por grep en `*.py,*.ts,*.tsx,*.sql,*.prisma`). Es exactamente el mecanismo que hace que la clasificación mejore con el uso.

### 2.2 Rutas de la API

| Método | Ruta | Auth | Estado |
|---|---|---|---|
| `GET` | `/categories/` | ✅ | **Único endpoint de categorías. No hay POST/PATCH/DELETE.** |
| `POST` | `/api/ocr/extract` | ❌ **sin auth** | Devuelve `items[]` con categoría en texto libre |
| `POST` | `/api/ocr/extract-bulk` | ❌ **sin auth** | Igual, + ZIP |
| `POST` | `/transactions/` | ✅ | **Sí persiste `items`** si vienen en el payload |
| `POST` | `/transactions/bulk` | ✅ | Acepta items, pero el frontend no los manda |

### 2.3 El hallazgo crítico: los productos se extraen y se tiran a la basura

El backend **sí** sabe leer los productos de una factura y **sí** sabe guardarlos. El frontend **nunca se los pasa**.

```
ocr_service.py:89-102     OCRItemResult{ item_name, quantity, unit_price, total_price, category }
        ↓
ocr_service.py:145-157    Prompt a Gemini: pide "category" por ítem (texto libre, sin validar)
        ↓
routers/ocr.py:28-30       Devuelve items[] en la respuesta HTTP  ✅
        ↓
transactions_service.py:38-54   Persiste items[] si llegan en el body  ✅
        ↓
transactions/actions.ts:26-35   createTransaction() NO incluye `items`  ❌
transactions/new/TransactionFormClient.tsx:110-147   Lee amount/date/description/category, IGNORA data.items  ❌
transactions/bulk/BulkTransactionClient.tsx:120-146    Mapea la respuesta, IGNORA res.items  ❌
        ↓
                                    → El usuario nunca ve ni registra sus productos  ❌
```

**Conclusión:** el backend está listo. Este punto es mucho más barato de cerrar de lo que aparenta.

### 2.4 Los otros problemas que encontré de paso

| # | Problema | Ubicación | Impacto |
|---|---|---|---|
| 1 | **Drift de esquema**: `transaction_items`, `user_category_rules`, `ai_chat_messages` están en Prisma pero **no** en `schema.sql` | `supabase/schema.sql` vs `backend/schema.prisma` | El script de despliegue no crea esas tablas → fallos en entorno limpio |
| 2 | **Fuga entre familias**: el OCR carga `prisma.category.find_many()` **sin filtrar por familia** | `routers/ocr.py:28` y `:44` | Las categorías privadas de otra familia se filtran al prompt de Gemini |
| 3 | **Endpoints OCR sin autenticación** | `routers/ocr.py:17`, `:38` | Cualquiera puede gastar tus créditos de Gemini |
| 4 | **Categorías sembradas incompletas**: `Salud` y `Otros` (usadas por el mapa de keywords del OCR en `ocr_service.py:415`) y `Préstamos Recibidos` / `Préstamos Otorgados` (exigidas por `debts_service.py:33` y `:103`) **no están sembradas** | `schema.sql:88-96` | Gemini sugiere "Salud" → el match del frontend falla → `category_id` queda `null`. Y **toda deuda creada queda sin categoría** porque `get_default_category()` no encuentra la fila |
| 5 | **Matching por `includes()` en ambos sentidos** | `TransactionFormClient.tsx:139-142` | "Comida" matchea "Comida rápida" y viceversa → categorías ambiguas |
| 6 | **Gemini puede inventar categorías** | `ocr_service.py:145-157` | El prompt pide la categoría de cada ítem sin restringirlas a la lista; nunca se valida contra `cat_list` |
| 7 | **Columna `categories.icon` muerta** | `schema.prisma:54` | Está en el modelo pero nada la lee; `lucide-react` ya está instalado |
| 8 | **Presupuestos por `category_id` con `on delete cascade`** | `schema.prisma:137` | Borrar una categoría con presupuesto **borra el presupuesto en silencio** — hay que avisar/confirmar en la UI |
| 9 | Sin scope de `family_id` en `stats_repository` más allá de los filtros | `stats_repository.py` | Correcto hoy, pero revisar al añadir dominios nuevos |

---

## 3. Diseño propuesto

### 3.1 Eje común: `categories` como catálogo

Se refuerza `categories` con tres cambios mínimos y de bajo riesgo:

```sql
-- (a) Unicidad por familia + tipo (evita duplicados y homónimos)
create unique index if not exists categories_family_name_type_uniq
  on categories (coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 lower(name), type);

-- (b) Permiso de un tercer tipo, para el dominio de necesidades
alter table categories drop constraint if exists categories_type_check;
alter table categories add constraint categories_type_check
  check (type in ('income','expense','need'));

-- (c) Jerarquía opcional: una categoría puede colgar de otra
alter table categories add column if not exists parent_id uuid
  references categories(id) on delete set null;
```

> **Nota sobre (b):** el tipo `'need'` es **opcional**. Recomiendo **no** añadirlo al principio (ver §3.3): las necesidades son *una cosa que comprar*, no un tercer tipo de movimiento de dinero. Se puede modelar con `category_id` apuntando a categorías `expense` normales y el estado `pending` en la propia fila de la necesidad. Mantener el CHECK en 2 valores evita contaminar los filtros `income`/`expense` de todo el dashboard.

Sobre (c): la jerarquía es tentadora ("Alimentación → Carnes → Res") pero **añade complejidad real**: los presupuestos son por `category_id` exacto, los charts agrupan por `category.name` exacto, y el OCR matchea por substring. Si añado jerarquía, hay que decidir qué pasa con un presupuesto puesto en el padre y el gasto en el hijo. **Mi recomendación: empezar plano, con `parent_id` presente pero sin usar**. Si más adelante quieres la jerarquía, la columna ya está y se activa sin migración.

### 3.2 Funcionalidad 1 — Categorías propias (CRUD)

**Backend** — respetando `Router → Service → Repository`:

`backend/app/models/category.py`
```python
class CategoryCreate(CategoryBase):
    icon: Optional[str] = None

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None

class CategoryResponse(CategoryBase):
    id: UUID
    family_id: Optional[UUID]
```

`backend/app/routers/category.py` — añadir:
```
POST   /categories/          crea categoría propia de la familia
PATCH  /categories/{id}      renombra / cambia icono (solo propias)
DELETE /categories/{id}      borra (solo propias; nunca las default)
```

`backend/app/services/categories_service.py` — reglas:
- `family_id` se toma **siempre** del perfil del usuario; **nunca** del body (evita que crees categorías en otra familia).
- **No** se pueden editar ni borrar categorías con `is_default = true`.
- Al borrar: se comprueban transacciones y presupuestos vinculados → se responde con el detalle de lo que se perderá, para que la UI pueda confirmar.
- Validación de duplicados por `(family_id, lower(name), type)`.

`backend/app/repositories/categories_repository.py` — añadir `create_category`, `update_category`, `delete_category`, `get_category_by_id`.

**Frontend** — nueva pestaña **"Categorías"** en `/settings` (`SettingsForm.tsx` ya tiene el patrón de tabs `general` | `appearance`):
- Lista agrupada por tipo (Ingresos / Gastos), con contador de uso.
- Creación inline con nombre + **selector de icono** (lucide-react ya está instalado → `categories.icon` deja de ser una columna muerta).
- Edición de nombre e icono.
- Borrado con confirmación que muestra: *"Esta categoría tiene 14 movimientos y 1 presupuesto. Si la borras, los movimientos quedarán sin categoría y el presupuesto se eliminará."*

**Compatibilidad:** `GET /categories/` ya devuelve `is_default=true` + las de la familia (`categories_repository.py:8-14`). No hay que tocar nada para que las nuevas aparezcan.

### 3.3 Funcionalidad 2 — Cada producto con su categoría

Esta es la que pediste primero. Requiere **cuatro** cambios coordinados.

#### (a) De texto libre a FK real

```sql
alter table transaction_items add column if not exists category_id uuid
  references categories(id) on delete set null;

-- Se conserva el texto original del OCR: sirve de fallback y de insumo
-- para aprender reglas.
-- (columna `category` existente = etiqueta cruda tal como la devolvió Gemini)
```

El modelo `TransactionItem` gana `category_id: Optional[UUID]` y `category_name: Optional[str]` (resuelto por join para el listado).

#### (b) Mostrar los productos en la UI (el punto que falta hoy)

En `TransactionFormClient.tsx`, tras el OCR, renderizar una **tabla de productos**:

```
┌──────────────────────────────────────────────────────────┐
│ Productos detectados (8)                                │
├─────────────────────┬────────┬──────────┬───────────────┤
│ Producto            │ Cant.  │ Total    │ Categoría     │
├─────────────────────┼────────┼──────────┼───────────────┤
│ Leche entera 1 L    │ 2      │ $ 8.400  │ [Alimentación ▾]│
│ Pan Tajado          │ 1      │ $ 4.500  │ [Panadería  ▾] │
│ Detergente conc.    │ 1      │ $ 22.000 │ [Hogar      ▾] │
└─────────────────────┴────────┴──────────┴───────────────┘
```

- El `<select>` se puebla con las categorías de la familia (las mismas del formulario).
- **Pre-selección automática**: el backend ya devuelve una categoría por ítem; se intenta mapearla a un `category_id` real.
- El usuario puede reasignar cualquiera en un clic. **Esto es lo que convierte la función en algo usable.**
- El mismo componente se reutiliza en el flujo bulk.

#### (c) Validar y mapear en el backend

Nuevo `CategoryMatcher` en `backend/app/services/categories_service.py`:

```
texto_crudo
  ├─ 1. Coincidencia EXACTA (case-insensitive) con nombre de categoría  → category_id
  ├─ 2. Coincidencia con ALIAS guardados por la familia                  → category_id
  ├─ 3. Normalización (sin tildes, singular/plural, prefijos "de la")     → category_id
  ├─ 4. Mapa de keywords del OCR (ya existe)                             → category_id
  └─ 5. Sin match                                                        → category_id = NULL
                                                          (se conserva el texto crudo)
```

Y en `ocr_service.py`, el prompt pasa a **restringir explícitamente** las categorías:

```
"category": "<elige EXACTAMENTE uno de: {cat_list}, o null si ninguno aplica>",
```

Tras la respuesta, **se valida** cada categoría devuelta contra la lista real; si no está, se normaliza a `null` y se conserva la etiqueta cruda. Nada de inventar categorías.

#### (d) Que la app aprenda de tus correcciones ← el diferenciador

Se **reactiva la tabla `user_category_rules`** que ya está declarada y muerta:

```sql
create table if not exists user_category_rules (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  raw_keyword text not null,
  category text not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  unique (user_id, merchant, raw_keyword)
);
```

Flujo:
1. El usuario corrige la categoría de un producto → *"Leche" en "Alquería La Esmeralda" es `Alimentación`*.
2. Se guarda la regla `(user_id, merchant="La Esmeralda", raw_keyword="leche") → "Alimentación"`.
3. **En la siguiente factura**, las reglas se aplican **antes** de llamar a Gemini → respuesta más consistente, más rápida y sin costo de API.
4. La app "aprende" y por eso el resultado mejora con el uso.

Es exactamente el mecanismo que ya está diseñado en el modelo y nunca se conectó.

> **Optimización de costo (relevante):** hoy cada factura consume una llamada a Gemini completa. Con reglas previa, si **todos** los productos tienen regla previa, se puede saltar la IA por completo. Además, la llamada de Gemini se puede pedir **sin imagen** si solo necesitamos texto… no aplica aquí, pero sí se puede pedir un prompt más corto.

### 3.4 Funcionalidad 3 — Control de "cosas que necesito"

Aquí es donde hay que decidir el modelo, porque "cosas que necesito" admite lecturas distintas. Las tres candidatas:

| Opción | Qué es | Modelo | Valor para NiddoFlow |
|---|---|---|---|
| **A. Lista de compra** | "Me falta leche, papel, detergente" con precio estimado; al comprarla se marca y genera transacción | Tabla `shopping_items` | **Alta** — cierra el ciclo con la factura |
| **B. Inventario del hogar** | Qué hay en la casa, cantidades, fechas de vencimiento | Tabla `household_items` + SKU | Media — alto esfuerzo, preguntas frecuentes ("¿cuánta leche hay?") |
| **C. Gasto planeado** | "Voy a gastar $200.000 en infraestructura este mes" | Se modela como presupuesto/devengo | Media — se solapa con `budgets` ya existente |

**Recomiendo A como primera versión**, por tres razones concretas:

1. **Encaja con lo que ya pediste.** Una necesidad necesita una **categoría** ("leche" → `Alimentación`) para saber a qué presupuesto va a impactar. Es el mismo eje.
2. **Cierra el bucle con el OCR.** Cuando escaneas la factura de la compra, los productos detectados **pueden marcar automáticamente como comprados** los ítems de la lista que coincidan (exacto o alias). Eso valida la lista y cierra el círculo.
3. **Escala hacia B después.** La opción B (inventario con cantidades y vencimientos) puede construirse **encima** de A, sin tirar lo hecho: `shopping_items` y `household_items` comparten `name`, `category_id`, `quantity`.

**Modelo de datos propuesto (A):**

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

create index if not exists shopping_items_family_status_idx
  on shopping_items (family_id, status);
```

**Endpoints** (`/shopping`, siguiendo el patrón Router → Service → Repository):
```
GET    /shopping/            lista pendientes (scope personal/familiar, como /transactions)
POST   /shopping/            crear necesidad
PATCH  /shopping/{id}        editar / marcar comprado
DELETE /shopping/{id}        eliminar
POST   /shopping/{id}/purchase   marca comprado + crea la transacción de gasto
```

**Frontend:** página `/shopping` con:
- Lista de pendientes agrupada por **categoría** (misma agrupación mental que los presupuestos).
- Campo rápido "añadir" con autocompletado de categorías.
- Botón **"Marcar comprado"** → genera la transacción con la categoría ya asignada → si hay presupuesto, se actualiza al instante.
- Al escanear una factura, coincidencia automática con la lista → marcar comprados.

**Ruta hacia la opción B (inventario) más adelante**, sin romper A:
```
shopping_items (status=pending)  →  "necesito comprar"
shopping_items (status=purchased) → "ya lo tengo"  ← base del inventario
```
Añadir `expiry_date` y `location` (alacena, nevera) a `shopping_items` más adelante, o duplicar a `household_items` cuando la complejidad lo justifique.

---

## 4. Plan de fases

### Fase 0 — Correcciones previas (0.5–1 día) 🛠️
Sin esto, todo lo demás queda sobre cimientos flojos.

- [ ] Sincronizar `supabase/schema.sql` con `schema.prisma` (crear `transaction_items`, `user_category_rules`, `ai_chat_messages`).
- [ ] Sembrar las categorías que faltan: `Salud`, `Otros`, `Préstamos Recibidos`, `Préstamos Otorgados`, `Deudas` (las usan `ocr_service.py:415-419` y `debts_service.py:33,103` — hoy **toda deuda creada queda sin categoría**).
- [ ] `ocr.py`: añadir `Depends(get_current_user)` a los dos endpoints.
- [ ] `ocr.py`: filtrar categorías por familia del usuario (no `find_many()` global).
- [ ] Índice único de categorías + Normalización de nombres existentes.

### Fase 1 — Categorías propias (1–2 días) ✅
- [ ] `models/category.py`: `CategoryCreate`, `CategoryUpdate`.
- [ ] `repositories/categories_repository.py`: `create/update/delete/get_by_id`.
- [ ] `services/categories_service.py`: validaciones (familía propia, no default, duplicados).
- [ ] `routers/category.py`: `POST`, `PATCH`, `DELETE`.
- [ ] Frontend: `categories.api.ts` + `useCategories` → `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory` (React Query, invalidación de `["categories"]`).
- [ ] Frontend: pestaña "Categorías" en `/settings` con selector de iconos (lucide-react).

### Fase 2 — Productos con categoría (2–3 días) ✅
- [ ] Migración: `transaction_items.category_id` FK.
- [ ] `models/transaction.py`: `TransactionItemBase.category_id`.
- [ ] `services/categories_service.py`: `CategoryMatcher` (exacto → alias → normalizado → keywords).
- [ ] `ocr_service.py`: restringir categorías en el prompt + validar la respuesta + aplicar matcher a cada ítem.
- [ ] `transactions_service.py`: persistir `category_id` del ítem.
- [ ] Frontend: componente `OcrItemsEditor` reutilizable (single + bulk), tabla de productos con `<select>` de categoría.
- [ ] Frontend: `actions.ts` → incluir `items` en `createTransaction` y `createBulkTransactions`.
- [ ] **Aprendizaje**: `POST /categories/rules` (crear regla al corregir), aplicar reglas antes de Gemini.

### Fase 3 — Necesidades / lista de compra (3–4 días) ✅
- [ ] Migración: tabla `shopping_items`.
- [ ] Backend: `routers/shopping.py` + `services/shopping_service.py` + `repositories/shopping_repository.py`.
- [ ] Frontend: página `/shopping` + item en `Navigation.tsx`.
- [ ] Flujo "marcar comprado" → crea transacción.
- [ ] Coincidencia automática con la lista al escanear factura.

---

## 5. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Gemini devuelve categorías inventadas → basura en BD | Validación contra la lista real + matcher determinista + fallback a `null` con etiqueta cruda conservada |
| Coste/latencia de Gemini en facturas con muchos productos | Reglas previa; si todo está cubierto, se omite la IA; prompt más corto con categorías restringidas |
| Duplicar categorías por error ("Comida" vs "comida ") | Índice único `(family_id, lower(name), type)` + normalización |
| Perder presupuestos al borrar una categoría | La UI avisa del impacto antes de confirmar; la API responde el detalle de lo afectado |
| Las categorías de otra familia filtrándose al prompt | Filtrado por familia en `ocr.py` (Fase 0) |
| Solapamiento con `budgets` y `debts` | Las necesidades **no** son un tipo de movimiento nuevo: son una lista que **genera** una transacción al comprarse |
| Que el historial de items se rompa con la nueva FK | `on delete set null` + la etiqueta cruda sobrevive en la columna `category` |

---

## 6. Decisiones que necesito confirmar

1. **Jerarquía de categorías**: ¿plano (recomendado) o con subcategorías anidadas? El modelo admite ambas; plano es mucho más simple y los presupuestos/gráficos ya asumen igualdad exacta.
2. **Dominio de necesidades**: ¿lista de compra (recomendado), inventario del hogar, o gasto planeado?
3. **Nivel de inteligencia**: ¿activar el aprendizaje automático de reglas (recomendado) o categorización manual solamente?
