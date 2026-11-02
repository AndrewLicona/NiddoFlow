# Despliegue de NiddoFlow en Dockploy

Guía para desplegar NiddoFlow con Dockploy usando el `docker-compose.yml` del repo.

---

## 1. Variables de entorno

Copia el contenido de [`deploy/dockploy.env`](deploy/dockploy.env) en
**Dockploy → tu aplicación → Environment Variables**.

> ⚠️ **Verifica `SUPABASE_KEY` antes de pegar.** Es la *service role key* y es
> el único valor queDockploy necesita en secreto real. Si tu `.env.production`
> local la tiene truncada, toma la completa desde
> **Supabase → Project Settings → API → Service Role → Reveal**.

> 🔒 **Nunca expongas `SUPABASE_KEY` ni `DATABASE_URL` como `NEXT_PUBLIC_*`.**
> Las variables `NEXT_PUBLIC_*` se hornean en el bundle del navegador.

---

## 2. Crear la aplicación

| Campo | Valor |
|-------|-------|
| **Resource Type** | Application |
| **Build Type** | Docker Compose |
| **Repository** | `AndrewLicona/NiddoFlow` |
| **Branch** | `main` |
| **Root Directory** | `/` (raíz del repo) |
| **Compose Path** | `docker-compose.yml` |
| **Dockerfile** | *(dejar vacío, lo usa el compose)* |

---

## 3. Puertos expuestos

El `docker-compose.yml` actual expone 3 puertos:

| Servicio | Puerto host | Contenedor | Para qué |
|----------|-------------|------------|----------|
| `nginx` | **3100** | 80 | **Este es el que va al dominio** |
| `frontend` | 3030 | 3030 | Next.js (debug) |
| `backend` | 8100 | 8100 | FastAPI (debug) |

**Para el dominio público, apunta a `3100`.** Es el nginx quien enruta
`/` → frontend y `/api/` → backend.

---

## 4. Configurar el dominio

En **Dockploy → tu app → Domains**:

| Campo | Valor |
|-------|-------|
| **Domain** | `niddoflow.miserverlab.xyz` |
| **Port** | `3100` |
| **Path** | *(vacío)* |
| **HTTPS** | ✅ Enabled |

> 💡 Si ya usas **Cloudflare Tunnel**, tienes 2 opciones:
> 1. **Opción A (recomendada):** apunta el Tunnel a `localhost:3100` — igual que hoy.
> 2. **Opción B:** deja que Dockploy gestione el dominio con su proxy integrated,
>    y mueve el Tunnel a otro subdomain.
>
> La opción A es la de menos cambios: la capa de red sigue igual y solo
> cambia quién compila y despliega.

---

## 5. Variables `NEXT_PUBLIC_*` y el build

Las variables `NEXT_PUBLIC_*` se **hornean en tiempo de build** de Next.js.
Por eso el `docker-compose.yml` las pasa como `build.args`.

El compose actual tiene estas dos **hardcodeadas** (no leen variable):

```yaml
args:
  - NEXT_PUBLIC_API_URL=https://niddoflow.miserverlab.xyz/api
  - NEXT_PUBLIC_BASE_URL=https://niddoflow.miserverlab.xyz
```

Si el dominio cambia, hay que editarlas en el compose **y** reconstruir.
Para que respondan a las variables de entorno, deben quedar así:

```yaml
args:
  - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
  - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
  - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
  - NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}
```

---

## 6. Primer deploy

1. **Deploy** → espera el build
2. Revisa **Logs** en el panel de Dockploy
3. Verifica los health checks:

```bash
# Desde el host
curl -s http://localhost:8100/health
curl -sI http://localhost:3100 | head -3
```

4. Abre `https://niddoflow.miserverlab.xyz` y prueba el login con Google

---

## 7. Después del primer deploy

Cada `git push` a `main` dispara build + deploy automático.

Si necesitas **rebuild sin cambios de código** (por ejemplo, para aplicar una
variable nueva), en Dockploy: **Deploy → Rebuild**.

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Login con Google da "fetch failed" | Los containers no resuelven DNS hacia Supabase (`EAI_AGAIN` / `[Errno -3] Temporary failure in name resolution`) | El `docker-compose.yml` ya fija `dns: 1.1.1.1 / 8.8.8.8`. Recrea los containers: `docker compose -p niddo-stack-ipomtt --env-file .env -f ./docker-compose.yml up -d --force-recreate --remove-orphans`. Si sigue igual, corre `sudo bash scripts/fix_docker_networking.sh` |
| `Manifest: Line: 1, column: 1, Syntax error` | `/manifest.json` devuelve una redirección a `/login` en vez de JSON | Verifica que `manifest.json` siga fuera del `matcher` de `frontend/src/middleware.ts` |
| `SW registration failed: ... behind a redirect` | `/sw.js` devuelve una redirección a `/login` | Mismo origen que el anterior: `sw.js` debe quedar fuera del `matcher` |
| `Invalid Server Actions request` | `x-forwarded-host` no coincide con `origin` (el puerto se pierde con `$host`) | nginx debe reenviar `Host`/`X-Forwarded-Host` con `$http_host` (puerto incluido) |
| `504` en `/api/*` | nginx no alcanza al backend | Revisa la red del compose: frontend y backend deben compartir red |
| El OCR responde vacío | `GEMINI_API_KEY` mal pegada o con espacios | Verifica la variable en Dockploy (sin comillas, sin espacios) |
| Cambió el dominio y no se refleja | `NEXT_PUBLIC_*` horneadas en build | Edita el compose + Rebuild |
| `401` en la API | `SUPABASE_KEY` incorrecta o truncada | Reemplázala por la service role key completa |
| Puerto 3100 ocupado | Otro servicio usa ese puerto | Cambia el mapeo en el compose y actualiza el dominio en Dockploy |

---

## DNS en los containers

Los containers heredan el resolver del host por defecto. Si el host usa
`systemd-resolved` (`nameserver 127.0.0.53`), Docker sustituye ese destino
por la IP del gateway del bridge, donde **nadie escucha**, y el DNS externo
deja de funcionar por completo:

```
getaddrinfo EAI_AGAIN rwpfhoykljsylesxxesh.supabase.co
[Errno -3] Temporary failure in name resolution
```

El `docker-compose.yml` lo evita fijando resolvers públicos de forma
explícita:

```yaml
x-dns-resolvers: &dns-resolvers
  dns:
    - 1.1.1.1
    - 8.8.8.8
  dns_opt:
    - timeout:2
    - attempts:3
```

Los nombres de servicio (`frontend`, `backend`) los sigue resolviendo el DNS
embebido de Docker, así que el compose no se rompe.

> ⚠️ Si cambias el compose, **recrea** los containers (`--force-recreate`).
> Un `docker compose restart` no aplica cambios de configuración de red.

Para diagnosticar en el servidor:

```bash
sudo bash scripts/fix_docker_networking.sh
```

El script comprueba el firewall (UFW `DEFAULT_FORWARD_POLICY` y la chain
`DOCKER-USER`), diagnostica el DNS dentro de los containers y verifica que
el login con Google tiene salida a Supabase.

---

## Nota sobre el `.env.local`

El backend lee `.env` si existe (`app/core/config.py`), pero **en Dockploy no
debes subir un `.env`**: define todo en Environment Variables del panel.
Así queda en un solo lugar y es auditable.
