#!/bin/bash

# NiddoFlow - Unified Deployment Script
# Description: Automates the process of pulling, cleaning, and rebuilding the NiddoFlow stack.
#
# Usage:
#   ./deploy.sh          # Quick deploy: git pull + restart (NO rebuild, ~10 seconds)
#   ./deploy.sh --build  # Rebuild: pull + rebuild images + restart (~5-15 minutes)
#   ./deploy.sh --full   # Deep: pull + rebuild + prune unused images (~10-20 minutes)

# Modern colors for better UX
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Parse flags
REBUILD=false
DEEP_CLEAN=false

for arg in "$@"; do
  case $arg in
    --build)
      REBUILD=true
      ;;
    --full|--deep)
      REBUILD=true
      DEEP_CLEAN=true
      ;;
    *)
      ;;
  esac
done

echo -e "${CYAN}🚀 Iniciando despliegue de NiddoFlow...${NC}"

# 1. Sincronizar con GitHub (Prioridad)
echo -e "${CYAN}📥 Sincronizando con el repositorio remoto (GitHub)...${NC}"
git fetch origin main
git reset --hard origin/main
chmod +x deploy.sh # Asegurar que el script siga siendo ejecutable

# 2. Verificar archivo de entorno
if [ ! -f .env.production ]; then
    echo -e "${RED}❌ Error: No se encontró el archivo .env.production${NC}"
    echo -e "${YELLOW}Crea uno antes de continuar (puedes usar .env.production.example como base).${NC}"
    exit 1
fi

# 3. Detener contenedores actuales
echo -e "${CYAN}🛑 Deteniendo servicios actuales...${NC}"
docker compose --env-file .env.production down

# 4. Limpieza profunda (solo con --full/--deep)
if [ "$DEEP_CLEAN" = true ]; then
    echo -e "${YELLOW}🧹 Realizando limpieza profunda (borrando imágenes y caché)...${NC}"
    docker system prune -af
fi

# 5. Construir e iniciar
if [ "$REBUILD" = true ]; then
    echo -e "${CYAN}🏗️  Construyendo imágenes y levantando servicios (modo --build)...${NC}"
    docker compose --env-file .env.production up -d --build
else
    echo -e "${CYAN}⚡ Levantando servicios sin reconstruir (modo rápido)...${NC}"
    docker compose --env-file .env.production up -d
fi

BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
    echo -e "${RED}❌ El build o despliegue falló con código de salida $BUILD_EXIT${NC}"
    echo -e "${YELLOW}Revisa los logs con: docker compose logs --tail=50${NC}"
    exit $BUILD_EXIT
fi

# 6. Verificación de salud
echo -e "${CYAN}🔍 Verificando estado de los servicios...${NC}"
sleep 5
docker ps | grep niddoflow

# 7. Resumen
echo ""
echo -e "${GREEN}✅ ¡Despliegue completado satisfactoriamente!${NC}"
echo -e "${GREEN}Accede a: https://niddoflow.miserverlab.xyz${NC}"

if [ "$REBUILD" = false ]; then
    echo ""
    echo -e "${YELLOW}💡 Tip: Si modificaste código o Dockerfiles, usa './deploy.sh --build' para reconstruir.${NC}"
fi