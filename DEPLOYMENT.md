# 🚀 Deployment Guide: Portainer Stack

## Pre-requisitos
1. ✅ Portainer instalado y accesible en `https://portainer.andrewlamaquina.my`
2. ✅ Cloudflare Tunnel configurado
3. ✅ Credenciales de Supabase listas

---

## ⚠️ Paso 0 (NUEVO, OBLIGATORIO): Aplicar la migración de base de datos

> **Estado actual: YA APLICADA en la base de producción (30/10/2026).**
> Las 52 sentencias se ejecutaron correctamente y se verificaron:
> `budgets_category_id_fkey` quedó en `ON DELETE SET NULL`, existen
> `shopping_items`, `savings_goals` y `recurring_bills`, y las columnas nuevas
> de `transactions` y `transaction_items` están presentes.
> Este paso se documenta porque **cualquier base nueva** (pruebas, staging o
> una restauración de respaldo) necesita la misma migración antes de desplegar.

Hay **dos** migraciones, y las dos son necesarias:

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20261030_improvements.sql` | Tablas y columnas nuevas, RLS, `budgets.category_id` a `SET NULL`. |
| `supabase/migrations/20261030_debts_category_set_null.sql` | `debts.category_id` a `SET NULL`, para que borrar una categoría con deudas asociadas no se bloquee. Un solo bloque `DO`: es atómico y se puede aplicar sobre el pooler. |

Las nuevas funcionalidades (productos de factura con categoría, categorías
propias, lista de necesidades, metas, cuentas del hogar, importador bancario)
usan **columnas y tablas nuevas**. En una base que aún no tenga la migración,
esas funciones se muestran en la interfaz pero **no guardan datos**.

### Qué hace la migración
`supabase/migrations/20261030_improvements.sql` es **aditiva e idempotente**:
- Crea las tablas `shopping_items`, `savings_goals`, `recurring_bills`.
- Añade columnas: `transaction_items.category_id` y `.confidence`;
  `transactions.merchant`, `.source`, `.image_hash`, `.import_hash`,
  `installment_current`, `installment_total`, `purchase_total_amount`;
  `categories.parent_id`; `budgets.user_id`.
- Cambia la FK de `budgets.category_id` de `CASCADE` a `SET NULL`, para que
  borrar una categoría **nunca** borre un presupuesto.
- Añade el índice único de categorías y las políticas RLS de las tablas nuevas.

> **Garantía de seguridad:** la migración **no** hace `DROP TABLE`, `TRUNCATE`
> ni cambia el tipo de ninguna columna existente. Se puede aplicar dos veces
> sin efecto adverso. Y si la base tuviera categorías duplicadas, la migración
> **no se aborta**: avisa y sigue.

> ⚠️ **Usa una conexión directa, no el pooler de transacciones.**
> El `DATABASE_URL` del proyecto apunta al *pooler* de Supabase (puerto 6543),
> que no soporta bien el DDL multi-sentencia: las consultas se reparten en
> conexiones distintas y la transacción se pierde a mitad de camino.
> Aplica la migración desde el **SQL Editor de Supabase** (opción A) o con
> una conexión directa al puerto 5432.

### Cómo aplicarla
**Opción A — Panel de Supabase (recomendada)**
1. Abre el proyecto en `supabase.com` → **SQL Editor**.
2. Pega el contenido de `supabase/migrations/20261030_improvements.sql`.
3. Ejecuta. Debe terminar sin errores.
4. Repite con `supabase/migrations/20261030_debts_category_set_null.sql`.

**Opción B — psql**
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261030_improvements.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261030_debts_category_set_null.sql
```

**Opción C — Contenedor de prueba**
```bash
docker run --rm --network host -e PGPASSWORD="$POSTGRES_PASSWORD" postgres:16-alpine \
  psql -h db -U postgres -d tu_base -v ON_ERROR_STOP=1 -f supabase/migrations/20261030_improvements.sql
```

### Verificar que quedó aplicada
```bash
# Debe listar 3 tablas nuevas y 0 duplicados
python backend/venv/Scripts/python.exe scripts/verify_migrations.py

# Salud de la base real (solo lectura): artefactos, RLS, FKs e integridad
python backend/venv/Scripts/python.exe scripts/verify_db_state.py

# Valida el SQL en un Postgres desechable (idempotencia real). Requiere Docker.
python backend/venv/Scripts/python.exe scripts/verify_schema_in_docker.py
```

> `verify_db_state.py` se conecta a **tu base real** y solo hace `SELECT`.
> Avisa si queda alguna tabla de prueba abandonada, si alguna tabla pública
> perdió el RLS, si una FK apunta en cascada a `categories`/`transactions` o
> si hay referencias huérfanas. Útil después de cualquier migración.

> `verify_schema_in_docker.py` levanta un Postgres de usar y tirar, aplica
> `schema.sql` y las migraciones **dos veces** para demostrar que son
> idempotentes, y destruye el contenedor y su volumen al terminar. No deja
> nada levantado.

> `audit_writes.py` inventaría todas las escrituras del backend y falla si
> alguna `update`/`delete` no está acotada por id y familia.
```

### Antes de aplicar: haz una copia
```bash
# Desde el panel de Supabase: Database -> Backups -> Download
```
La migración es segura, pero un respaldo te da la tranquilidad de poder
volver atrás en cualquier momento.

---

## Paso 1: Preparar el Código en el Servidor

### Opción A: Clonar desde GitHub (Recomendado)
```bash
ssh andrew@server
cd ~
git clone https://github.com/AndrewLicona/NiddoFlow.git
cd NiddoFlow
```

### Opción B: Subir desde tu PC
```bash
# Desde tu PC Windows
scp -r C:\Users\ajlic\Documents\Proyectos\NiddoFlow andrew@server:~/
```

---

## Paso 2: Configurar Variables de Entorno

En el servidor, edita el archivo `.env.production`:

```bash
cd ~/NiddoFlow
nano .env.production
```

Llena tus credenciales de Supabase:
- `NEXT_PUBLIC_SUPABASE_URL`: Tu URL de Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Tu Anon Key
- `SUPABASE_SERVICE_KEY`: Tu Service Role Key

Y **estas tres claves, que son obligatorias para las funcionalidades nuevas**:

| Clave | Para qué sirve | Qué pasa si falta |
|---|---|---|
| `DATABASE_URL` | Prisma: acceso directo a PostgreSQL (lecturas analíticas, `transaction_items`, reglas aprendidas) | El backend cae al cliente Supabase y algunas consultas quedan degradadas o lentas |
| `GEMINI_API_KEY` | OCR con IA (Gemini): extrae la factura, los productos y las cuotas | El OCR cae a Tesseract local: lee menos campos y no detecta cuotas |
| `OCR_PROVIDER` | Selecciona el proveedor de OCR (`gemini` u `openai`) | Se usa el valor por defecto (`gemini`) |

> `DATABASE_URL` se copia de **Supabase → Settings → Database → Connection string**
> (cadena del *pooler de transacciones*, puerto 6543, con `?pgbouncer=true`).
> `GEMINI_API_KEY` se consigue en <https://aistudio.google.com/app/apikey>
> (admite varias separadas por comas para rotar cuota).

Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`

---

## Paso 3: Crear Stack en Portainer

1. **Ir a Portainer**: `https://portainer.andrewlamaquina.my`
2. **Navegar a**: `Stacks` → `Add stack`
3. **Configurar**:
   - **Name**: `niddoflow`
   - **Build method**: `Repository` o `Upload`
   
### Opción A: Desde Repositorio Git
- **Repository URL**: `https://github.com/AndrewLicona/NiddoFlow`
- **Compose path**: `docker-compose.yml`

### Opción B: Upload/Editor
- Copia y pega el contenido de `docker-compose.yml`

4. **Environment variables**: Click en `Load variables from .env file`
   - Sube el archivo `.env.production` que editaste

5. **Deploy**: Click en `Deploy the stack`

---

## Paso 4: Verificar el Deployment

### Monitorear los Contenedores
En Portainer → Containers, verifica que estén corriendo:
- ✅ `niddoflow-frontend` (healthy)
- ✅ `niddoflow-backend` (healthy)
- ✅ `niddoflow-nginx` (running)

### Ver Logs
Si algo falla, revisa los logs en Portainer:
1. Click en el contenedor
2. Tab `Logs`
3. Busca errores

---

## Paso 5: Configurar Cloudflare Tunnel

### En Cloudflare Zero Trust Dashboard:
1. **Access** → **Tunnels** → Tu tunnel existente
2. **Public Hostname** → **Add a public hostname**
3. Configurar:
   - **Subdomain**: `niddoflow`
   - **Domain**: `andrewlamaquina.my`
   - **Type**: `HTTP`
   - **URL**: `localhost:3100`

4. **Save**

---

## Paso 6: Verificar Funcionamiento

Visita estos endpoints:

1. **Health Check Nginx**: `https://niddoflow.andrewlamaquina.my/health`
   - Debe responder: `healthy`

2. **Backend API Health**: `https://niddoflow.andrewlamaquina.my/api/health`
   - Debe responder: JSON con status

3. **Frontend**: `https://niddoflow.andrewlamaquina.my`
   - Debe cargar la página de login

---

## 🔧 Troubleshooting

### Error: "502 Bad Gateway"
```bash
# Ver logs del backend
docker logs niddoflow-backend

# Verificar que Supabase esté configurado correctamente
docker exec niddoflow-backend env | grep SUPABASE
```

### Error: "CORS policy"
Verifica que `CORS_ORIGINS` en `.env.production` sea:
```
CORS_ORIGINS=https://niddoflow.andrewlamaquina.my
```

### Rebuild después de cambios
```bash
cd ~/NiddoFlow
git pull  # Si usas Git
docker-compose down
docker-compose up -d --build
```

---

## 📝 Comandos Útiles

```bash
# Ver todos los contenedores
docker ps -a | grep niddoflow

# Ver logs en tiempo real
docker logs -f niddoflow-backend

# Reiniciar un contenedor
docker restart niddoflow-frontend

### Limpieza y Re-inicio (Clean Start)
Si experimentas lentitud extrema, errores `ERR_FAILED` o inconsistencias, usa este comando para borrarlo todo y empezar de nuevo con las últimas imágenes:

```bash
docker compose down
docker system prune -af  # ⚠️ Cuidado: Borra todas las imágenes no usadas
git pull origin main
docker compose down
docker compose --env-file .env.production up -d --build
```
git fetch origin main
git reset --hard origin/main
docker compose down
docker compose --env-file .env.production up -d --build
---

## 📝 Comandos Útiles

```bash
# Ver todos los contenedores
docker ps -a | grep niddoflow

# Ver logs en tiempo real
docker logs -f niddoflow-backend

# Reiniciar un contenedor
docker restart niddoflow-frontend

# Eliminar todo (incluyendo volúmenes) y empezar de nuevo
docker compose down -v
docker compose up -d --build
```

