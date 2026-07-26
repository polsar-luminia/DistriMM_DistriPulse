# MCP Server DistriMM — Plan de implementacion

## Arquitectura

```
Claude Code (tu PC) ──SSE/stdio──> MCP Server (VPS) ──REST API──> Supabase
                                    Node.js + PM2         service_role key
                                    Zero storage
```

El server actua como **proxy de solo lectura** hacia Supabase. No almacena datos localmente.
Cuando Claude pide datos, el server hace la query en tiempo real y retorna el resultado.

## Stack en VPS

- Node.js 20 LTS (instalacion via nvm)
- PM2 para proceso persistente
- @modelcontextprotocol/sdk para el protocolo MCP
- @supabase/supabase-js para queries
- Transporte: SSE (Server-Sent Events) sobre HTTP para conexion remota

## Tools que expone el MCP server

### Cartera
1. `cartera_resumen` — KPIs globales: total cartera, vencida, al dia, por vendedor
2. `cartera_detalle_vendedor` — Facturas de un vendedor con dias mora, saldo, cliente
3. `cartera_buscar_facturas` — Buscar facturas por NIT, documento, o cliente

### Ventas / Comisiones
4. `ventas_resumen_periodo` — Total ventas, costo, margen por vendedor en un mes
5. `ventas_detalle_vendedor` — Items de venta de un vendedor con producto, factura, costo
6. `comisiones_liquidacion` — Snapshot de liquidacion mensual (ventas + recaudo)
7. `comisiones_presupuestos` — Presupuestos por marca y recaudo de un vendedor/mes

### Recaudo
8. `recaudo_resumen_periodo` — Total recaudado, comisionable, excluido por mora/marca
9. `recaudo_detalle_vendedor` — Recibos de un vendedor con factura, dias, exclusion

### Maestros
10. `clientes_buscar` — Buscar cliente por NIT o nombre
11. `vendedores_listar` — Lista de vendedores con codigo y nombre
12. `catalogo_buscar` — Buscar producto por codigo o nombre, ver marca
13. `exclusiones_listar` — Reglas de exclusion activas (marcas y productos)

### Audit
14. `audit_log` — Ultimas N operaciones del audit log

## Estructura del proyecto

```
mcp-distrimm-server/
  package.json
  src/
    index.js          — Entry point, MCP server setup
    supabase.js       — Cliente Supabase con service_role
    tools/
      cartera.js      — Tools 1-3
      ventas.js       — Tools 4-5
      comisiones.js   — Tools 6-7
      recaudo.js      — Tools 8-9
      maestros.js     — Tools 10-13
      audit.js        — Tool 14
  .env                — SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT
  ecosystem.config.js — PM2 config
```

## Variables de entorno

```
SUPABASE_URL=https://xzhqhmjfhnvqxndxayxs.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  (service_role, NO anon key)
PORT=3100
```

## Seguridad

- El server usa `service_role` key (acceso completo a la DB, bypass RLS)
- El server SOLO expone tools de lectura (SELECT). No permite INSERT/UPDATE/DELETE
- El puerto 3100 debe estar en firewall/solo accesible desde tu IP
- .env nunca se commitea

## Conexion desde Claude Code (tu PC)

En tu `~/.claude/settings.json` o en el proyecto:

```json
{
  "mcpServers": {
    "distrimm": {
      "type": "sse",
      "url": "http://TU_VPS_IP:3100/sse"
    }
  }
}
```

## Setup en VPS (comandos)

```bash
# 1. Instalar Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 2. Instalar PM2
npm install -g pm2

# 3. Clonar/copiar el proyecto
cd /opt
git clone <repo> mcp-distrimm-server
cd mcp-distrimm-server
npm install

# 4. Configurar .env
cp .env.example .env
nano .env  # pegar las keys

# 5. Iniciar con PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # para que arranque al reiniciar el VPS
```
