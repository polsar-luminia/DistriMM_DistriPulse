# DistriMM MCP Server

Servidor [MCP](https://modelcontextprotocol.io) (StreamableHTTP, stateless) que expone los datos
de DistriMM para que gerencia consulte desde **ChatGPT** o **Claude** en lenguaje natural:
ventas, cartera, inventario, comisiones y sugerido de compra.

- **URL del conector:** `https://distrimm.luminiatech.digital/mcp/<TOKEN>`
- **Proceso:** PM2 `distrimm-mcp` (puerto 3102, solo localhost; nginx hace el proxy TLS)
- **Datos:** RPCs `fn_mcp_*` en Supabase (`sql/mcp_server_rpcs.sql`), solo lectura,
  ejecutables únicamente con `service_role`.

## Herramientas

| Tool | Qué responde |
|---|---|
| `resumen_ejecutivo` | Panorama: ventas del mes vs anterior, cartera, inventario, comisiones |
| `consultar_ventas` | Ventas por mes/día/vendedor/marca/categoría/producto/cliente/municipio |
| `consultar_cartera` | Cartera por aging/vendedor/cliente/zona/ciudad, filtro por días de mora |
| `consultar_inventario` | Existencias por bodega/marca/categoría/producto (bodegas confiables 1, 5, 6) |
| `analisis_stock_y_sugerido` | Stock muerto/lento/crítico/agotado + sugerido de compra |
| `consultar_comisiones` | Liquidación mensual por vendedor (desde snapshots oficiales) |
| `search` / `fetch` | Búsqueda y ficha de productos, clientes y vendedores (contrato ChatGPT) |

## Cómo conectar un gerente desde ChatGPT

Requiere plan Plus/Pro/Team/Enterprise.

1. En ChatGPT: **Configuración → Conectores** (si no aparece, activar primero
   **Configuración → Conectores → Avanzado → Modo de desarrollador**).
2. **Crear** / **Añadir conector personalizado**:
   - **Nombre:** `DistriMM`
   - **URL del servidor MCP:** `https://distrimm.luminiatech.digital/mcp/<TOKEN>`
     (pedir la URL completa con el token al administrador — no compartirla fuera de gerencia)
   - **Autenticación:** *Sin autenticación* (el token va dentro de la URL)
   - Marcar la casilla de confianza y crear.
3. En un chat nuevo: botón **+ / Herramientas → DistriMM** (en modo desarrollador se
   habilita por chat) y preguntar, por ejemplo:
   - *"¿Cómo van las ventas de este mes comparadas con el mes pasado?"*
   - *"¿Cuánta cartera vencida a más de 60 días tenemos y de qué clientes?"*
   - *"¿Qué stock muerto tenemos y cuánta plata hay inmovilizada?"*
   - *"¿Qué deberíamos pedir para cubrir 30 días con 15% de crecimiento?"*
   - *"¿Cómo van las comisiones de los vendedores este mes?"*

En **Claude** (claude.ai → Configuración → Conectores → Añadir conector personalizado)
funciona con la misma URL.

## Operación

```bash
# Logs
ssh admin@161.97.111.39 'pm2 logs distrimm-mcp --lines 50'

# Reiniciar
ssh admin@161.97.111.39 'pm2 restart distrimm-mcp'

# Salud (sin token, no expone datos)
curl https://distrimm.luminiatech.digital/mcp/health
```

**Rotar el token** (si se filtra la URL): editar `MCP_ACCESS_TOKEN` en
`/var/www/distrimm-agro/mcp-server/.env`, `pm2 restart distrimm-mcp` y actualizar
la URL del conector en los ChatGPT de gerencia.

## Deploy de cambios

```bash
cat mcp-server/src/ARCHIVO.js | ssh admin@161.97.111.39 'cat > /var/www/distrimm-agro/mcp-server/src/ARCHIVO.js'
ssh admin@161.97.111.39 'pm2 restart distrimm-mcp'
```

Si cambian las dependencias: subir `package.json`, `npm install --omit=dev` en el VPS y reiniciar.
