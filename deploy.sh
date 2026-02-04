#!/bin/bash

# NiddoFlow - Unified Deployment Script
# Description: Automates the process of pulling, cleaning, and rebuilding the NiddoFlow stack.

# Modern colors for better UX
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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
docker compose down

# 4. Limpieza opcional (opción profunda)
if [[ "$*" == *"--deep"* ]]; then
    echo -e "${YELLOW}🧹 Realizando limpieza profunda (borrando imágenes y caché)...${NC}"
    docker system prune -af
fi

# 5. Construir e iniciar
echo -e "${CYAN}🏗️ Construyendo y levantando servicios...${NC}"
docker compose --env-file .env.production up -d --build

# 6. Verificación de salud
echo -e "${CYAN}🔍 Verificando estado de los servicios...${NC}"
sleep 5
docker ps | grep niddoflow

echo -e "${GREEN}✅ ¡Despliegue completado satisfactoriamente!${NC}"
echo -e "${GREEN}Accede a: https://niddoflow.andrewlamaquina.my${NC}"
