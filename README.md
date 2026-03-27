# DistriMM Analytics

Plataforma de analitica avanzada para gestion de cartera, clientes, comisiones, mensajeria WhatsApp y asistente CFO con IA.

## Requisitos

- Node.js >= 18 (ver `.nvmrc`)
- [pnpm](https://pnpm.io/) como package manager

## Instalacion

```bash
pnpm install       # Instalar dependencias
cp .env.example .env  # Copiar y llenar variables de entorno
pnpm dev           # Servidor de desarrollo (localhost:5173)
```

## Variables de Entorno

Copiar `.env.example` a `.env` y completar los valores. El archivo documenta cada variable y donde obtenerla.

**Variables requeridas:**
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` — Proyecto Supabase

**Secretos en Supabase Edge Functions** (Dashboard > Edge Functions > Secrets):
- `N8N_WHATSAPP_URL` — Webhook de mensajeria n8n
- `N8N_WEBHOOK_URL` — Webhook de analisis CFO n8n
- `N8N_CHAT_URL` — Webhook de chatbot n8n
- `N8N_AUTH_KEY` — Secreto compartido para llamadas n8n

## Scripts

```bash
pnpm dev           # Servidor de desarrollo (Vite)
pnpm build         # Build de produccion (genera dist/)
pnpm preview       # Preview del build de produccion
pnpm lint          # Chequeo ESLint
pnpm format        # Formateo Prettier
pnpm test          # Tests unitarios (Vitest)
pnpm verify        # Lint + test + build (chequeo pre-deploy)
```

## Deploy en VPS

### 1. Build

```bash
pnpm install
pnpm build
```

Esto genera la carpeta `dist/` con los archivos estaticos listos para servir.

### 2. Configuracion Nginx

DistriMM es una SPA (Single Page Application). El servidor web debe redirigir todas las rutas a `index.html`.

```nginx
server {
    listen 80;
    server_name tu-dominio.com;
    root /ruta/a/distrimm/dist;
    index index.html;

    # Comprimir assets
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1000;

    # Cache de assets con hash (inmutable)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback — todas las rutas van a index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 3. HTTPS (recomendado)

```bash
sudo certbot --nginx -d tu-dominio.com
```

### 4. Variables de entorno

Las variables `VITE_*` se incorporan al build en tiempo de compilacion. Si cambias alguna variable, debes hacer `pnpm build` de nuevo.

## Seguridad

- **RLS**: Supabase Row Level Security habilitado en todas las tablas. Solo usuarios autenticados pueden acceder.
- **Edge Functions**: WhatsApp y CFO se proxean via Edge Functions para proteger secretos.
- **Chatbot**: Proxeado via Edge Function (`proxy-n8n-chatbot`), solo lectura.
- Las migraciones SQL de referencia estan en la carpeta `sql/`.

## Arquitectura

```
src/
  components/     # Componentes React (DashboardManager es el root)
  pages/          # Paginas (lazy-loaded las pesadas)
  services/       # Capa de servicios (Supabase, n8n, WhatsApp)
  hooks/          # Custom hooks (usePortfolioAnalytics, useMessaging, etc.)
  utils/          # Utilidades (ETL Excel, calculos, formatters)
  context/        # AuthContext
  lib/            # Cliente Supabase singleton
```

## Modulos

| Modulo | Ruta | Descripcion |
|--------|------|-------------|
| Dashboard | `/` | KPIs, graficos, tabla detallada de cartera |
| Clientes | `/clientes` | Listado con filtros por estado y mora |
| Directorio | `/directorio` | CRM de clientes con datos de contacto |
| Vendedores | `/vendedores` | Metricas por vendedor |
| Archivos | `/archivos` | Carga de Excel (cartera + clientes) |
| Mensajes | `/mensajes` | WhatsApp: plantillas, lotes, historial |
| CFO | `/cfo` | Analisis financiero con IA |
| Chatbot | `/chatbot` | Asistente conversacional de cartera |
| Score Crediticio | `/score-crediticio` | Calificacion crediticia de clientes |
| Comisiones | `/comisiones` | Calculadora de comisiones por vendedor |
