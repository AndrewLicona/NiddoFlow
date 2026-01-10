# Port Allocation for NiddoFlow

## Assigned Ports
- **Nginx (Public)**: `3100` → Exposed to host for Cloudflare Tunnel
- **Frontend (Internal)**: `3000` → Only accessible within Docker network
- **Backend (Internal)**: `8000` → Only accessible within Docker network

## Existing Services (Avoid These)
- `3003` - Portfolio
- `5432` - PostgreSQL
- `5678` - n8n
- `6001-6002` - Soketi
- `6379` - Redis
- `8000` - Coolify
- `8080` - Server page frontend
- `9000, 9443` - Portainer

## Cloudflare Tunnel Configuration
Point your tunnel to: `http://localhost:3100`
