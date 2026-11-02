#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# NiddoFlow — Fix de networking Docker + UFW en servidores con Dockploy
#
# Diagnostica y repara:
#   1. UFW con DEFAULT_FORWARD_POLICY="DROP" rompe el trafico
#      container -> internet (login con Google / Supabase / OCR fallan)
#   2. Chain DOCKER-USER vacia = Docker no puede salir ni alcanzar el host
#   3. DNS roto dentro de los containers: el resolver embebido de Docker
#      (127.0.0.11) reenvia a los nameservers del HOST; si el host usa
#      systemd-resolved (127.0.0.53) no hay nadie escuchando en la IP
#      del gateway y TODO el DNS externo falla:
#          getaddrinfo EAI_AGAIN rwpfhoykljsylesxxesh.supabase.co
#          [Errno -3] Temporary failure in name resolution
#   4. Reporta el ingress de Cloudflare Tunnel para validar el dominio
#
# SEGURO: NO toca la cadena nat/POSTROUTING. Nunca aplica MASQUERADE global.
#
# Uso:  sudo bash scripts/fix_docker_networking.sh
#
# Opciones:
#   APPLY_DAEMON_DNS=1   Ademas aplica un dns global en
#                         /etc/docker/daemon.json y reinicia Docker
#                         (hay unos segundos de downtime).
# ─────────────────────────────────────────────────────────────

set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

BRIDGE_WILDCARD='br-+'
BACKEND_PORT='8100'
FRONTEND_PORT='3030'
NGINX_PORT='3100'
SUPABASE_HOST='rwpfhoykljsylesxxesh.supabase.co'
PUBLIC_DNS='1.1.1.1 8.8.8.8'

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
info "1/7  Estado actual del firewall"
hr
printf "  DEFAULT_FORWARD_POLICY : "
grep -E '^DEFAULT_FORWARD_POLICY' /etc/default/ufw 2>/dev/null | cut -d'"' -f2 || echo "(no encontrado)"

echo
echo "  Chain DOCKER-USER:"
sudo iptables -L DOCKER-USER -n -v --line-numbers 2>/dev/null | sed 's/^/    /'

echo
echo "  Chain FORWARD (primeras lineas):"
sudo iptables -L FORWARD -n -v --line-numbers 2>/dev/null | head -6 | sed 's/^/    /'

echo
hr

# ─────────────────────────────────────────────────────────────
info "2/7  Aplicando reglas en DOCKER-USER"
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
  ok "Insertada: -i br-+ -j ACCEPT"
fi

if has_rule "-o $BRIDGE_WILDCARD.*ACCEPT"; then
  ok "Regla '-o br-+ ACCEPT' ya existe"
else
  sudo iptables -I DOCKER-USER -o "$BRIDGE_WILDCARD" -j ACCEPT
  ok "Insertada: -o br-+ -j ACCEPT"
fi

echo
hr

# ─────────────────────────────────────────────────────────────
info "3/7  Ajustando DEFAULT_FORWARD_POLICY de UFW"
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
info "4/7  Diagnostico de DNS en los containers"
hr

echo "  /etc/resolv.conf del HOST:"
if [ -f /etc/resolv.conf ]; then
  sed 's/^/    /' /etc/resolv.conf
else
  warn "  no existe /etc/resolv.conf"
fi

echo
echo "  /etc/resolv.conf de los containers:"
for c in niddoflow-frontend niddoflow-backend; do
  if docker ps --format '{{.Names}}' | grep -qx "$c"; then
    printf "    [%s]\n" "$c"
    docker exec "$c" cat /etc/resolv.conf 2>/dev/null | sed 's/^/      /'
  fi
done

echo
echo "  Resolucion de $SUPABASE_HOST desde cada container:"
DNS_STATE='ok'
for c in niddoflow-frontend niddoflow-backend; do
  if docker ps --format '{{.Names}}' | grep -qx "$c"; then
    if docker exec "$c" sh -c "getent hosts $SUPABASE_HOST" >/dev/null 2>&1; then
      ok "$c -> resuelve $SUPABASE_HOST"
    else
      err "$c -> NO resuelve $SUPABASE_HOST (el login con Google fallara)"
      DNS_STATE='broken'
    fi
  fi
done

echo
echo "  El HOST si resuelve el dominio:"
if getent hosts "$SUPABASE_HOST" >/dev/null 2>&1; then
  ok "host -> resuelve $SUPABASE_HOST"
else
  warn "host -> NO resuelve $SUPABASE_HOST (problema de DNS del servidor, no de Docker)"
  DNS_STATE='broken'
fi

if [ "$DNS_STATE" = 'broken' ]; then
  echo
  warn "DNS roto. El orden de accion:"
  echo
  echo "  A) Si el HOST tampoco resuelve, arregla el DNS del servidor:"
  echo "       sudo systemctl restart systemd-resolved"
  echo "       # o edita /etc/resolv.conf con un nameserver publico"
  echo
  echo "  B) Si el HOST resuelve pero los containers no, el resolver"
  echo "     embebido de Docker no tiene destino valido. El"
  echo "     docker-compose.yml del repo ya lo corrige:"
  echo "         dns: [1.1.1.1, 8.8.8.8]"
  echo "     Recrea los containers para que apliquen el cambio:"
  echo "         cd /etc/dokploy/compose/niddo-stack-ipomtt/code"
  echo "         docker compose -p niddo-stack-ipomtt --env-file .env \\"
  echo "           -f ./docker-compose.yml up -d --force-recreate --remove-orphans"
  echo
  echo "  C) Fix global del daemon (opcional, reinicia Docker):"
  echo "         APPLY_DAEMON_DNS=1 sudo bash scripts/fix_docker_networking.sh"
fi

# ─────────────────────────────────────────────────────────────
# Fix global opcional del daemon de Docker.
if [ "${APPLY_DAEMON_DNS:-0}" = '1' ]; then
  echo
  info "  Aplicando dns global en /etc/docker/daemon.json"
  mkdir -p /etc/docker
  if [ -f /etc/docker/daemon.json ]; then
    BACKUP="/etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M%S)"
    cp /etc/docker/daemon.json "$BACKUP"
    warn "  Backup creado: $BACKUP"
    if command -v python3 >/dev/null 2>&1; then
      python3 - "$BACKUP" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as fh:
    cfg = json.load(fh)
cfg["dns"] = ["1.1.1.1", "8.8.8.8"]
cfg["dns-opts"] = ["timeout:2", "attempts:3"]
with open(path, "w") as fh:
    json.dump(cfg, fh, indent=2)
    fh.write("\n")
print("  dns combinado con la config existente")
PY
      ok "  /etc/docker/daemon.json actualizado (claves existentes conservadas)"
    else
      warn "  python3 no disponible: combina 'dns' a mano en el backup"
    fi
  else
    cat > /etc/docker/daemon.json <<'JSON'
{
  "dns": ["1.1.1.1", "8.8.8.8"],
  "dns-opts": ["timeout:2", "attempts:3"]
}
JSON
    ok "  /etc/docker/daemon.json creado"
  fi

  warn "  Reiniciando Docker (los containers se detienen unos segundos)..."
  if systemctl restart docker; then
    ok "  Docker reiniciado"
  else
    err "  Fallo al reiniciar Docker - revisa 'systemctl status docker'"
  fi
fi

echo
hr

# ─────────────────────────────────────────────────────────────
info "5/7  Persistiendo reglas de iptables"
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
info "6/7  Verificacion de conectividad"
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
echo "  Alcance a Supabase (TCP 443) desde los containers:"
for c in niddoflow-frontend niddoflow-backend; do
  if docker ps --format '{{.Names}}' | grep -qx "$c"; then
    if docker exec "$c" sh -c "getent hosts $SUPABASE_HOST >/dev/null 2>&1 && \
        wget -q -T 8 -O /dev/null https://$SUPABASE_HOST/auth/v1/health" >/dev/null 2>&1; then
      ok "$c -> alcanza $SUPABASE_HOST:443"
    else
      warn "$c -> no pudo confirmar HTTPS contra $SUPABASE_HOST (revisa UFW/DOCKER-USER)"
    fi
  fi
done

echo
hr

# ─────────────────────────────────────────────────────────────
info "7/7  Cloudflare Tunnel (ingress)"
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
