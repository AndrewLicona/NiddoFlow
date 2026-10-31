# Recomendaciones de Mejora — NiddoFlow

> Ingeniería de producto: funcionalidades nuevas, mejoras de OCR y salto de la IA.
> Principio rector: **cero riesgo de datos**. Nada que destruya, trunque ni corrompa lo existente.

---

## 0. Diagnóstico: por qué hoy la "inteligencia" no intelligence

Antes de proponer, hay que ser honesto sobre el estado real. Encontré **cinco defectos concretos** que explican por qué el control de gastos y la IA se sienten flojos. **Ninguno requiere migración destructiva para arreglarse.**

### D1 · La IA está ciega a las categorías 🔴

`backend/app/services/chat_service.py:62`

```python
tx_list_str = "; ".join([f"[{t.type}] {t.description}: ${t.amount:,.2f} ({t.date.strftime('%Y-%m-%d')} en {t.account.name})" for t in transactions])
```

El código hace `include={"category": True}` (línea 47) **pero nunca imprime el nombre de la categoría**. Consecuencia: si preguntas *"¿cuánto gastamos en comida este mes?"*, la IA responde inventando, porque literalmente no sabe a qué categoría pertenece cada movimiento. Es el defecto más grave de los cinco: afecta la pregunta más natural del producto.

### D2 · La IA está ciega al gasto real de los presupuestos 🔴

`backend/app/services/chat_service.py:60`

```python
budget_summary = ", ".join([f"{b.category.name}: ${b.spent if hasattr(b, 'spent') else 0}/{b.amount}" for b in budgets])
```

El modelo `Budget` (`backend/schema.prisma:124-141`) **no tiene campo `spent`**. `hasattr(b, 'spent')` es **siempre `False`** → el `else 0` siempre se ejecuta. La IA le dice al usuario *"Comida: $0 / $400.000"* cuando en realidad lleva gastados $180.000. El asistente nunca puede advertir un desborde.

### D3 · La IA no sabe quién gastó qué 🟠

El contexto no incluye el nombre del miembro (`profiles.full_name`). Con `include={"category": True, "account": True}` pero sin perfil, la IA no puede responder *"¿quién gasta más en transporte?"* — justo lo que pediste: que la IA tenga **toda la información de la familia**, no solo del que pregunta.

### D4 · Las alertas de presupuesto del dashboard son acumuladas desde el origen 🟠

`frontend/src/app/dashboard/components/SmartFeed.tsx:26-30`

```typescript
const expensesByCategory = transactions
    .filter((t: any) => t.type === 'expense')   // ← NO filtra por mes
    .reduce((acc, t) => acc[t.category_id] + t.amount, {});
```

Compara con `frontend/src/app/budgets/BudgetClient.tsx:144-148`, que **sí** filtra por `month`/`year`. Resultado: en la página de presupuestos ves el progreso correcto, pero en el "Centro de Inteligencia" del dashboard ves la **suma histórica completa**. Las alertas disparan cuando no deben, o no disparan cuando deben. Dos pantallas, dos verdades.

### D5 · El motor de insights está en el navegador y es código muerto 🟠

- `frontend/src/utils/analytics.ts` calcula los insights en el **cliente**, sobre el array de transacciones que el navegador happen tener cargado.
- `frontend/src/app/dashboard/components/InsightsFeed.tsx` **no se importa en ningún lado** (verificado por grep en todo `frontend/src`). Es código muerto.
- `SmartFeed` sí lo usa, pero sin el filtro de mes que sí tiene el motor.

**Conclusión:** el problema de fondo no es que falte "más IA". Es que **toda la inteligencia vive en el cliente, sobre datos parciales, sin una capa de agregación en el servidor**. Arreglar eso primero convierte en innecesarias muchas de las mejoras que se podrían añadir encima.

---

## 1. Arquitectura objetivo: la capa de agregación

**Esta es la recomendación estructural más importante, y es la que habilita todo lo demás.**

```
HOY
  Transacciones ──► el NAVEGADOR ──► filtros en JS ──► insights
                    (todo se recalcula en cada render,
                     con el subconjunto que el browser tengas)

PROPUESTO
  Transacciones ──► SERVIDOR (SQL agregado) ──► /insights ──► Dashboard + IA
                                       └──────────► /chat/tools (la IA consulta lo que necesita)
```

Un endpoint nuevo, **sin tocar ninguna tabla**:

```
GET /insights/?scope=family&month=2026-10
```

Que devuelve, ya calculados y con el mes correctamente acotado:

```json
{
  "totals":      { "income": 5200000, "expense": 3180000, "balance": 2020000, "savings_rate": 38.8 },
  "by_category": [ { "category": "Alimentación", "amount": 840000, "pct_of_total": 26.4, "trend_vs_last_month": 12.1 } ],
  "by_member":   [ { "member": "Andrew", "amount": 1420000, "transactions": 23 } ],
  "by_account":  [ { "account": "Principal", "amount": 980000 } ],
  "budgets":     [ { "category": "Alimentación", "amount": 1000000, "spent": 840000, "percent": 84.0, "status": "warning" } ],
  "top_merchants": [ { "merchant": "Alquería La Esmeralda", "amount": 210000, "visits": 6 } ],
  "recurring":   [ { "merchant": "Netflix", "amount": 55000, "cadence": "monthly", "last_seen": "2026-10-02" } ],
  "anomalies":   [ { "kind": "category_spike", "detail": "Transporte +62% vs. el mes anterior" } ],
  "cashflow":    { "projected_end_of_month": 1480000, "days_until_negative": null }
}
```

**Por qué esto lo cambia todo:**

| Beneficio | Detalle |
|---|---|
| **Arregla D1–D4 de raíz** | Categorías, miembros, presupuestos y scoping por mes salen correctos por construcción |
| **La IA deja de adivinar** | Recibe agregados exactos, no un volcado de texto para que haga aritmética mental (los LLM son malo en eso) |
| **Consistencia** | Dashboard, reportes y chat muestran **los mismos números**. Hoy cada pantalla cuenta cosas distintas |
| **Rendimiento** | El dashboard deja de recalcular en cada render; una query vs. N filtros en JS |
| **Cero riesgo** | Es un endpoint nuevo de **solo lectura**. No migra nada |

> **Regla de oro:** si un cálculo se necesita en más de un sitio, va al servidor. El cliente renderiza, no razona.

---

## 2. OCR — 9 mejoras concretas

Ordenadas por relación valor/esfuerzo. **Ninguna rompe la API actual** (todo es retrocompatible: campos nuevos opcionales).

### O1 · PDFs de varias páginas 🔴 — *bug real*

`backend/app/services/ocr_service.py:519`

```python
pix = page.getpixmap(dpi=150)   # doc.load_page(0)  ← SOLO LA PÁGINA 1
```

Una factura de servicios en Colombia (EPM, Claro, Enel) ocupa **2–4 páginas**, y el total suele estar en la última. Hoy se procesa la primera y se pierde el total o se lee un subtotal. **Corrección:** iterar todas las páginas y enviar las N imágenes a Gemini, o unirlas verticalmente en una sola imagen.

### O2 · Cuotas de tarjeta crédito 🔴 — *muy relevante en Colombia*

Nada en el OCR detecta *"Cuota 2 de 3"*. Hoy esa factura registra solo el valor de la cuota y el dashboard muestra un gasto de $180.000 cuando la compra real fue de $540.000. **Corrección:** el prompt debe pedir `installments: {current, total}` y `total_purchase_amount`, y registrar:
- el **total de la compra** (para análisis y presupuestos),
- el **valor de la cuota pagada** (para el movimiento de caja del mes).

Es la diferencia entre "control de gastos" real y control de flujo de caja.

### O3 · Nivel de confianza por campo 🟠

Hoy el OCR devuelve un valor o `null`, sin decir cuánto confía. **Corrección:** añadir `confidence: {amount, date, merchant, total}` por campo. El frontend marca en ámbar los campos dudosos para que el usuario los revise en un clic. Esto reduce la fricción y **elimina la necesidad de que el usuario revise todo**.

### O4 · Extracción y normalización del comercio 🟠

Hoy `description` es "lo que el modelo escribió". **Corrección:** extraer un `merchant` normalizado (sin sufijoslegal: "ALQUERIA LA ESMERALDA S.A.S. → Alquería La Esmeralda"). Esto es **la llave para el aprendizaje de reglas** que detallo en §3.4: sin comercio normalizado no hay reglasidays consistentes.

### O5 · Validación de categorías 🟠 — *ya analizado en el doc previo*

El prompt de `ocr_service.py:145-157` ofrece las categorías pero **no restringe ni valida**. Gemini puede devolver "Alimentación y Bebidas" y se guarda como texto libre. **Corrección:** restringir en el prompt + validar contra la lista real + fallback a `null` conservando la etiqueta cruda.

### O6 · Detección de recibos duplicados 🟢

Escanear dos veces la misma foto genera dos movimientos. **Corrección:** hash perceptual de la imagen + merchant + fecha + total. Si coincide, se avisa *"Esta factura ya fue registrada"*. Solo lectura + un `warning` en la UI. **Cero riesgo.**

### O7 · IVA, descuentos, propina y pago en efectivo 🟢

El extractor actual busca "total", "subtotal", "importe". **Corrección:** extraer por separado `subtotal`, `tax`, `discount`, `tip`, `total`, y detectar pago mixto (efectivo + tarjeta). El total es lo que se guarda; el resto alimenta contexto para la IA.

### O8 · Procesamiento paralelo en carga masiva 🟢

`backend/app/routers/ocr.py:47-78` procesa los archivos del ZIP **secuencialmente** con `await` dentro de un `for`. 30 facturas = 30 llamadas en fila. **Corrección:** `asyncio.gather` con un semáforo (límite de 3–4 concurrentes) para respetar el rate limit de Gemini. Reduce el tiempo de 4 minutos a ~1 minuto.

### O9 · Preprocesamiento de imagen 🟢 *(opcional)*

Fotos de celular con sombras y perspectiva degradan el OCR. `opencv-python` puede corregir perspectiva, recortar el recibo y eliminar sombras. **Es la única mejora que agrega una dependencia** (`opencv-python-headless`, ~40 MB). Recomiendo **dejarla para el final** y solo si las métricas de acierto lo justifican.

---

## 3. IA — de asistente de texto a asistente con contexto real

### 3.1 · Las correcciones previas (D1, D2, D3) — obligatorias

Antes de cualquier mejora de IA, el contexto debe ser correcto. Reescribir `get_user_financial_context` para que use **el endpoint `/insights`** en vez del volcado de texto:

```python
# ANTES (chat_service.py:59-68) — volcado de texto plano
# DESPUÉS — agregado estructurado y con el mes acotado
insights = await insights_service.get_insights(family_id, scope, month)

context = f"""
ESTADO (mes {month}, alcance {scope}):
- Ingresos: {insights.totals.income:,.0f} | Gastos: {insights.totals.expense:,.0f} | Balance: {insights.totals.balance:,.0f}
- Tasa de ahorro: {insights.totals.savings_rate:.1f}%

GASTO POR CATEGORÍA (mes actual vs. anterior):
{por_categoria}

GASTO POR MIEMBRO:
{por_miembro}

PRESUPUESTOS (gastado / límite / estado):
{presupuestos}

COMERCIOS TOP: {comercios}
GASTOS RECURRENTES: {recurrentes}
DEUDAS Y COMPROMISOS: {deudas}
"""
```

Con esto, la IA responde *"¿cuánto gastamos en comida?"* con el dato exacto, y *"¿cómo vamos de presupuesto?"* con el $ gastado real. **Cuatro preguntas que hoy no puede responder.**

### 3.2 · Tool calling — el salto de calidad 🟢 *(el mejor bang for the buck)*

Hoy el prompt le dice a la IA que si le piden registrar algo *"los guíe al formulario"*. La IA es **débil por diseño**. Con Gemini Function Calling puede consultar datos herself:

```
Tools (SOLO LECTURA — riesgo cero):
  get_summary(scope, month)            → totales del mes
  get_spend_by_category(scope, month)  → desglose por categoría
  get_spend_by_member(scope, month)    → quién gastó qué
  get_budget_status(scope, month)      → gastado vs. límite por categoría
  get_transactions(filters)            → movimientos filtrados
  get_debts()                          → compromisos
  get_recurring()                      → suscripciones detectadas
  get_price_history(product)           → historial de precios de un producto
```

Y opcionalmente, con confirmación:

```
Tools (ESCRITURA — requieren confirmación explícita del usuario):
  propose_transaction(...)   → devuelve una PROPUESTA, la UI la muestra con "Confirmar"
  propose_category(...)      → idem
```

**El patrón `propose_*` es la clave de seguridad**: la IA **nunca** escribe directamente. Propone, la UI muestra un botón "Confirmar", el usuario aprieta. Así cumples "que no haya un borrado sin querer" por diseño, no por convención.

Además, el `scope` lo decide la IA según la pregunta:
- *"¿gasté yo?"* → `scope=personal`
- *"¿gastamos?"* → `scope=family`

### 3.3 · Memoria entre sesiones 🟢

`ai_chat_messages` se **escribe** (`chat_service.py:77`) pero **nunca se relee** para construir el prompt. Solo se envía el historial en memoria de la sesión del navegador (`NiddoAIChat.tsx:59`). **Corrección:** al iniciar una sesión de chat, cargar los últimos N mensajes del usuario desde la tabla. Contexto persistente, coste casi nulo.

### 3.4 · El aprendizaje: que la IA se acuerde de tus correcciones 🟠

Esto es lo que convierte la app en "smart" de verdad, y la tabla **ya existe en el modelo pero está muerta** (`user_category_rules` en `backend/schema.prisma:111-122`, sin tabla en `schema.sql`, sin una sola referencia en el código).

```
Factura: "Leche entera 1L" en "Alquería La Esmeralda"
   ↓ OCR dice "Alimentación" — tú lo corriges a "Lácteos"
   ↓ Se guarda la regla (merchant="Alquería La Esmeralda", raw_keyword="leche", category="Lácticos")
   ↓ Próxima factura en el mismo sitio: la regla se aplica ANTES de llamar a Gemini
     → respuesta más consistente, más rápida y más barata
```

**Consecuencia extra:** si *todos* los productos de una factura tienen regla previa, **se puede omitir la llamada a Gemini por completo**. Ahorro real de cuota y latencia.

Esto requiere que el comercio esté normalizado (O4) y que las reglas se apliquen en el orden: `reglas → exacto → alias → normalizado → keywords → null`.

### 3.5 · Motor de insights proactivo del servidor 🟠

Hoy los insights se calculan en el navegador (D5). Si se mueven al servidor (como `/insights`), se habilitan tres cosas que hoy son imposibles:

1. **Detección de anomalías**: "Transporte lleva 62% más que el mes pasado".
2. **Insights con explicación**: cada tarjeta dice de dónde sale el dato ("3 movimientos de transporte en la cuenta principal").
3. **Programados**: un job que corre al cierre del día y guarda un "resumen del día" → el usuario abre la app y recibe *"Hoy gastaste $84.000, 30% más que tu promedio diario"* sin pedir nada.

> **Implementación del job:** el proyecto **no tiene celery, ni APScheduler, ni un worker**. Opciones: (a) un `asyncio` loop en el lifespan de FastAPI (lo más simple, sin dependencias nuevas), o (b) un cron externo que llame a un endpoint. **Recomiendo (a)**: un `asyncio.create_task` con un `while True: await asyncio.sleep(...)` en `backend/main.py`. Cero dependencias, cero riesgo.

---

## 4. Nuevos módulos funcionales

Ordenados por valor. Marco el **nivel de riesgo** (ver §5).

### M1 · Detección de gastos recurrentes y suscripciones 🟢

**Valor: alto · Riesgo: NINGUNO (sin escrituras)**

Hoy las suscripciones (Netflix, Spotify, iCloud, gym, arriendo) son invisiblemente un gasto más. El motor puede detectar, sin escribir nada, patrones con alta confianza:
- mismo comercio, mismo monto, cada ~30 días → mensual
- cada ~7 días → semanal
- mismo monto los días 1 y 15 → quincenal

Resultado: pantalla "Suscripciones: 8 activas · $312.000/mes · +$15.000 vs. el año pasado", con alertas cuando una sube. **Todo se deriva de `transactions` — cero cambios de esquema.**

### M2 · Historial de precios por producto 🟢 *(tras el fix de items)*

**Valor: alto · Riesgo: NINGUNO (derivado)**

Una vez que los productos se guarden (Fase 2 del doc previo), cada línea queda como un precio con fecha. De ahí sale, gratis:
- "La leche subió de $4.200 a $4.800 en 3 meses"
- "Esta marca de café cuesta 18% menos que la que compras antes"
- "Compraste 12 kg de papa este mes vs. 4 el anterior"

Esto es **exactamente** el tipo de control de "cosas del hogar y alimentación" que pediste, y ya no necesitas una tabla nueva: sale de `transaction_items`.

### M3 · Flujo de caja proyectado 🟢

**Valor: alto · Riesgo: NINGUNO (derivado)**

Con el patrón de ingresos (si es estable) y los recurrentes detectados, proyectar el saldo a fin de mes:
> "Si mantienes tu ritmo actual, terminas el mes con $1.480.000. Tu Arl (arriendo) sale el día 1."

Con **alertas predictivas**: "el día 12 te vas a quedar por debajo de cero con el gasto proyectado". Eso es lo que hace que una app de control de gastos sea valiosa de verdad.

### M4 · Metas de ahorro 🟡

**Valor: alto · Riesgo: BAJO (tabla nueva)**

Tabla nueva `savings_goals` (aditiva, sin tocar nada existente):

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

Allow-pooling: "ahorrar para el viaje" puede recibir aportes desde varias cuentas. Gamificación: barras de progreso en el dashboard.

### M5 · Balance entre miembros (liquidación) 🟢 *(derivado)*

**Valor: medio-alto · Riesgo: NINGUNO**

Hoy cada miembro ve los gastos familiares sin poder saber quién le debe a quién. Con `transactions.user_id` + `account.user_id` se calcula un grafo de deudas y se propone un plan de liquidación mínima:
> "Andrew le debe $124.000 a María. Basta con que María le transfiera $124.000."

Sin escrituras: es un cálculo. La liquidación sí sería una transferencia normal usando la función que ya existe.

### M6 · Segmentar el dashboard por miembro 🟢

Hoy el dashboard muestra totales familiares. Un selector "Ver: Familiar / Andrew / María" con todo el dashboard recalculado responde a *"¿en qué gastó más cada uno?"*. Es un cambio de parámetro en un endpoint nuevo, no de esquema.

### M7 · Filtros y reportes por miembro 🟢

`ReportsClient.tsx` (28 KB) ya tiene filtros por fecha/tipo. Agregar **miembro**, **categoría**, **comercio** y **rango de monto** cierra el sistema de reportes.

### M8 · Importador de movimientos bancarios (CSV/OFX) 🟡

**Valor: muy alto · Riesgo: MEDIO (escrituras, pero controladas)**

Permite bajar los movimientos del banco y subirlos de golpe, en vez de registrar a mano. Es el mayor salto de adopción de cualquier app de finanzas. Precauciones para que sea seguro:
- **modo simulación primero**: muestra qué crearía, sin escribir nada;
- **detección de duplicados** contra transacciones existentes (merchant + fecha + monto);
- **previsualización con checkboxes** antes de confirmar;
- **nunca borra**: si el importador detecta un movimiento que ya no existe en el banco, lo marca para revisión manual en lugar de eliminarlo.

### M9 · Recordatorios y cuentas por pagar del hogar 🟡

**Valor: medio-alto · Riesgo: BAJO (tabla nueva)**

`recurring_bills`: arriendo, servicios, seguros, college. Con fecha de cobro y recordatorio. Complementa a los `debts` actuales, que son de personas, no de servicios recurrentes.

### M10 · Estándar de gastos propio (línea base mensual) 🟢

**Valor: medio · Riesgo: NINGUNO**

"¿Cuánto gastamos en alimentación los últimos 6 meses, mes a mes, y cuál fue el mes más caro?" — es una agregación. El valor está en **comparar tu consumo contra un estándar de tu propia historia**, no contra promedios genéricos.

### M11 · Reporte fiscal / deducciones (Colombia) 🟡

**Valor: medio · Riesgo: BAJO**

Reporte por categoría con umbral de deducibilidad, exportable a PDF y CSV. Requiere revisar la normatividad vigente y por eso lo dejaría para el final, pero es un diferenciador real para el mercado local.

### M12 · Inventario del hogar 🟡 *(ya analizado en el doc previo)*

Control de qué hay en casa, cantidades y vencimientos. Se construye **encima** de la lista de compra: `status='purchased'` → "ya lo tengo".

### M13 · Control de ingresos 🟢

**Valor: medio · Riesgo: NINGUNO**

Más allá del total: clasificar ingresos como **fijo vs. variable**, ver la **concentración de ingresos** (si el 90% viene de un solo origen, eso es un riesgo) y el **ingreso por cuenta**.

### M14 · Patrimonio neto 🟢

**Valor: medio · Riesgo: NINGUNO**

Cuentas − deudas − obligaciones = patrimonio, con serie histórica. Sale de `accounts` + `debts` que ya existen.

---

## 5. Sistema de niveles de riesgo

Para que puedas aprobar sin miedo. **Cada nivel es acumulable.**

### 🟢 TIER 0 — Solo lectura · **Riesgo CERO**
No se toca el esquema. No se escribe nada.

`/insights` · detección de recurrentes · historial de precios · flujo de caja proyectado · balance entre miembros · segmentación por miembro · contexto corregido de la IA (D1–D3) · insights del servidor

> **Empieza aquí.** El 70 % del valor percibido está en este tier y no puede romper nada.

### 🟡 TIER 1 — Tablas nuevas (aditivas) · **Riesgo BAJO**
`create table if not exists`. Ninguna tabla existente se altera. Ningún dato se borra.

`savings_goals` · `shopping_items` · `recurring_bills`

### 🟡 TIER 2 — Columnas nuevas nullable · **Riesgo BAJO**
FK siempre `on delete set null` → borrar una categoría **nunca** borra historial.

`transaction_items.category_id` · `transactions.installments` · `transactions.merchant`

### 🟠 TIER 3 — Escrituras controladas · **Riesgo MEDIO**
Requiere confirmación explícita, **siempre**.

Tool `propose_transaction` de la IA · importador bancario (modo simulación + previsualización)

### 🔴 EVITAR (no recomendado)
Cambios de tipo en columnas existentes · `DROP TABLE` · reescrituras masivas de `transactions` · migraciones que reescriban `transaction_items` · cualquier cosa que rompa la API actual sin necesidad.

---

## 6. Reglas de oro de implementación

1. **Migraciones idempotentes**: `create table if not exists`, `add column if not exists`, `create index if not exists`. Se pueden correr dos veces sin romper.
2. **Ninguna columna existente cambia de tipo.** Solo `add column` nullable.
3. **FK siempre `on delete set null` o `cascade` solo desde tablas nuevas.** Un `cascade` desde `categories` a `transactions` **no debe tocar el historial**.
4. **La IA propone, el usuario confirma.** Patrón `propose_*` + botón "Confirmar". Nunca escritura directa.
5. **Nada se borra automáticamente.** Todo borrado es explícito, con confirmación que muestre qué se va a perder.
6. **Todo cambio de comportamiento va detrás de un flag.** Si algo sale mal, se desactiva sin rollback de esquema.
7. **El servidor calcula, el cliente renderiza.** Si un cálculo aparece en dos pantallas, va al servidor.
8. **Una migración de prueba antes de producción**: correr el SQL contra una base clonada y comparar `count(*)` de cada tabla antes y después.

---

## 7. Roadmap recomendado

| Fase | Contenido | Riesgo | Esfuerzo |
|---|---|---|---|
| **0. Cimientos** | Arreglar D1–D5 · sync de `schema.sql` · sembrar categorías faltantes · auth en OCR · scope por familia en OCR | 🟢 | 1 día |
| **1. Capa de agregación** | `/insights` + mover insights al servidor + corregir SmartFeed | 🟢 | 1.5 días |
| **2. IA con contexto** | Contexto agregado real + tool calling de solo lectura + memoria entre sesiones | 🟢 | 2 días |
| **3. OCR++)** | Multi-página · cuotas · confianza · comercio normalizado · validación de categorías | 🟢/🟡 | 2.5 días |
| **4. Categorías + productos** | CRUD de categorías · items persistidos y editables · reglas de aprendizaje | 🟡 | 3 días |
| **5. Módulos de valor** | Recurrentes · precios · flujo de caja · metas · balance entre miembros | 🟢/🟡 | 4 días |
| **6. Necesidades** | Lista de compra + coincidencia con facturas | 🟡 | 3 días |
| **7. Importador** | CSV bancario con simulación y previsualización | 🟠 | 3 días |

**Lo que da más con menos:** Fases 0 + 1 + 2. En 4–5 días pasas de una app que *muestra* números a una que *razona* sobre ellos — y todo en Tier 0, sin tocar el esquema.

---

## 8. Tabla resumen priorizada

| # | Propuesta | Valor | Riesgo | Esfuerzo | Depende de |
|---|---|---|---|---|---|
| 1 | `/insights` (agregación en servidor) | 🔥🔥🔥 | 🟢 Cero | 1.5 d | — |
| 2 | Arreglar IA ciega (categorías/presupuestos/miembros) | 🔥🔥🔥 | 🟢 Cero | 0.5 d | 1 |
| 3 | Tool calling de solo lectura | 🔥🔥🔥 | 🟢 Cero | 1.5 d | 1 |
| 4 | SmartFeed con scoping por mes | 🔥🔥 | 🟢 Cero | 0.5 d | — |
| 5 | OCR multi-página | 🔥🔥🔥 | 🟢 Cero | 0.5 d | — |
| 6 | Detección de cuotas | 🔥🔥 | 🟢 Cero | 0.5 d | 5 |
| 7 | Recurrentes y suscripciones | 🔥🔥 | 🟢 Cero | 1 d | 1 |
| 8 | Flujo de caja proyectado | 🔥🔥 | 🟢 Cero | 1 d | 7 |
| 9 | Metas de ahorro | 🔥🔥 | 🟡 Bajo | 1.5 d | — |
| 10 | Historial de precios por producto | 🔥🔥 | 🟢 Cero | 1 d | Fase 4 |
| 11 | Comercios + reglas de aprendizaje | 🔥🔥 | 🟡 Bajo | 1.5 d | 3, Fase 4 |
| 12 | Balance entre miembros | 🔥 | 🟢 Cero | 1 d | 1 |
| 13 | Importador CSV bancario | 🔥🔥 | 🟠 Medio | 3 d | 1 |
| 14 | Lista de compra (necesidades) | 🔥🔥 | 🟡 Bajo | 3 d | 4, 6 |
| 15 | CRUD de categorías propias | 🔥🔥 | 🟡 Bajo | 1.5 d | — |
| 16 | Item → categoría (productos de factura) | 🔥🔥🔥 | 🟡 Bajo | 2 d | 15 |

---

## 9. Nota sobre las decisiones abiertas

El documento previo (`ANALISIS_CATEGORIAS_Y_NECESIDADES.md`) dejó abiertas cuatro decisiones —jerarquía de categorías, modelo de necesidades, aprendizaje automático y fase inicial— que siguen sin respuesta. **Este documento no depende de ninguna de ellas**: todo lo propuesto aquí es ortogonal y se puede implementar igual en cualquier escenario. Lo único que esas decisiones cambian es *cuándo* construir la Fase 4 y la Fase 6.
