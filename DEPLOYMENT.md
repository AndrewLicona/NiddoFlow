# 🚀 Deployment Guide: Portainer Stack

## Pre-requisitos
1. ✅ Portainer instalado y accesible en `https://portainer.andrewlamaquina.my`
2. ✅ Cloudflare Tunnel configurado
3. ✅ Credenciales de Supabase listas

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

# Eliminar todo y empezar de nuevo
docker-compose down -v
docker-compose up -d --build
```
