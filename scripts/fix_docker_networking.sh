#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# NiddoFlow — Fix de networking Docker + UFW en servidores con Dockploy
#
# Diagnostica y repara:
#   1. UFW con DEFAULT_FORWARD_POLICY="DROP" rompe el trafico
#      container -> internet (login con Google / Supabase / OCR fallan)
#   2. Chain DOCKER-USER vacia = Docker no puede salir ni alcanzar el host
#   3. Reporta el ingress de Cloudflare Tunnel para validar el dominio
#
# SEGURO: NO toca la cadena nat/POSTROUTING. Nunca aplica MASQUERADE global.
#
# Uso:  sudo bash scripts/fix_docker_networking.sh
# ─────────────────────────────────────────────────────────────

set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

BRIDGE_WILDCARD='br-+'
BACKEND_PORT='8100'
FRONTEND_PORT='3030'
NGINX_PORT='3100'
SUPABASE_HOST='rwpfhoykljsylesxxesh.supabase.co'

hr() { printf '%s\n' "────────────────────────────────────────────────────────────"; }
info() { printf "${CYAN}%s${NC}\n" "$*"; }
ok()   { printf "${GREEN}✔ %s${NC}\n" "$*"; }
warn() { printf "${YELLOW}! %s${NC}\n" "$*"; }
err()  { printf "${RED}✘ %s${NC}\n" "$*"; }

[ "$(id -u)" -ne 0 ] && { err "Ejecuta con sudo"; exit 1; }

echo
hr
echo "  NiddoFlow · Fix networking Docker + UFW"
hr
echo

# ─────────────────────────────────────────────────────────────
info "1/6  Estado actual del firewall"
hr
printf "  DEFAULT_FORWARD_POLICY : "
grep -E '^DEFAULT_FORWARD_POLICY' /etc/default/ufw 2>/dev/null | cut -d'"' -f2 || echo "(no encontrado)"

echo "  Chain DOCKER-USER:"
sudo iptables -L DOCKER-USER -n -v --line-numbers 2>/dev/null | sed 's/^/    /'

echo
echo "  Chain FORWARD (primeras lineas):"
sudo iptables -L FORWARD -n -v --line-numbers 2>/dev/null | head -6 | sed 's/^/    /'

echo
hr

# ─────────────────────────────────────────────────────────────
info "2/6  Aplicando reglas en DOCKER-USER"
hr

# Idempotente: no duplicar si ya existe una regla equivalente
has_rule() {
  sudo iptables -L DOCKER-USER -n --line-numbers 2>/dev/null \
    | grep -qE "$1"
}

if has_rule "-i $BRIDGE_WILDCARD.*ACCEPT"; then
  ok "Regla '-i br-+ ACCEPT' ya existe"
else
  sudo iptables -I DOCKER-USER -i "$BRIDGE_WILDCARD" -j ACCEPT
  ok "Insertada: -i $BRIDGE_WILDCARD -j ACCEPT"
fi

if has_rule "-o $BRIDGE_WILDCARD.*ACCEPT"; then
  ok "Regla '-o br-+ ACCEPT' ya existe"
else
  sudo iptables -I DOCKER-USER -o "$BRIDGE_WILDCARD" -j ACCEPT
  ok "Insertada: -o $BRIDGE_WILDCARD -j ACCEPT"
fi

echo
hr

# ─────────────────────────────────────────────────────────────
info "3/6  Ajustando DEFAULT_FORWARD_POLICY de UFW"
hr
if grep -qE '^DEFAULT_FORWARD_POLICY="ACCEPT"' /etc/default/ufw 2>/dev/null; then
  ok "Ya estaba en ACCEPT"
else
  if [ -f /etc/default/ufw ]; then
    sudo sed -i 's/^DEFAULT_FORWARD_POLICY="DROP"/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
    ok "DEFAULT_FORWARD_POLICY cambiado a ACCEPT"
    sudo ufw reload >/dev/null 2>&1 && ok "ufw reload ejecutado" \
      || warn "No se pudo recargar ufw (sigue activo con la config anterior en memoria)"
  else
    warn "/etc/default/ufw no existe (UFW no instalado) - se omite"
  fi
fi

echo
hr

# ─────────────────────────────────────────────────────────────
info "4/6  Persistiendo reglas de iptables"
hr
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save >/dev/null 2>&1 \
    && ok "netfilter-persistent save: reglas guardadas" \
    || warn "netfilter-persistent save fallo (revisar si el servicio esta activo)"
else
  warn "netfilter-persistent no instalado. Las reglas se perderan tras un reboot."
  warn "Instalar con: apt-get install -y iptables-persistent"
  echo "  Alternativa manual:"
  echo "    sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null"
fi

echo
hr

# ─────────────────────────────────────────────────────────────
info "5/6  Verificacion de conectividad"
hr

check_local() {
  local url="$1" label="$2"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null)
  if [ "$code" = "000" ] || [ -z "$code" ]; then
    err "$label -> NO RESPONDE ($url)"
  else
    ok "$label -> HTTP $code"
  fi
}

check_local "http://localhost:$NGINX_PORT"  "nginx (:$NGINX_PORT)"
check_local "http://localhost:$FRONTEND_PORT" "frontend (:$FRONTEND_PORT)"

BH=$(curl -s --max-time 5 "http://localhost:$BACKEND_PORT/health" 2>/dev/null)
if [ -n "$BH" ]; then
  ok "backend (:$BACKEND_PORT) -> $BH"
else
  err "backend (:$BACKEND_PORT) -> NO RESPONDE"
fi

echo
echo "  DNS desde los containers (Supabase):"
for c in niddoflow-frontend niddoflow-backend; do
  if docker ps --format '{{.Names}}' | grep -qx "$c"; then
    if docker exec "$c" sh -c "getent hosts $SUPABASE_HOST" >/dev/null 2>&1; then
      ok "$c -> resuelve $SUPABASE_HOST"
    else
      err "$c -> NO resuelve $SUPABASE_HOST (login con Google fallara)"
    fi
  fi
done

echo
hr

# ─────────────────────────────────────────────────────────────
info "6/6  Cloudflare Tunnel (ingress)"
hr

TUNNEL_UNIT=$(systemctl list-units --type=service --all --no-legend 2>/dev/null \
  | awk '/cloudflared/ {print $1; exit}')

if [ -n "$TUNNEL_UNIT" ]; then
  ok "Servicio: $TUNNEL_UNIT"
  echo
  echo "  ExecStart:"
  systemctl cat "$TUNNEL_UNIT" 2>/dev/null | grep -E '^\s*(ExecStart|EnvironmentFile)' | sed 's/^/    /'
  echo
  for cfg in /etc/cloudflared/config.yml /etc/cloudflared/config.yaml; do
    if [ -f "$cfg" ]; then
      echo "  ── $cfg ──"
      cat "$cfg" | sed 's/^/    /'
      echo
      echo "  >>> Verifica que el hostname de NiddoFlow apunte al puerto $NGINX_PORT <<<"
      break
    fi
  done
else
  warn "No se encontro el servicio systemd de cloudflared en esta maquina."
  echo "  Si corre como container de Dockploy, revisa el panel de Dockploy"
  echo "  (Service/Tunnel) y la config del ingress."
fi

echo
hr
echo "  Resumen"
hr
echo
echo "  Si el dominio sigue vacio, el problema NO es el firewall:"
echo "    -> corrige el ingress del tunnel para que el hostname de NiddoFlow"
echo "       apunte a  http://localhost:$NGINX_PORT   (no 3000 ni 3030)"
echo "    -> luego:  sudo systemctl restart ${TUNNEL_UNIT:-cloudflared}"
echo
echo "  Si el login con Google falla, mira los logs del frontend:"
echo "    docker logs --tail 30 niddoflow-frontend"
echo
