# Spec: eCommerce DistriMM — Homepage + Catálogo

**Fecha:** 2026-03-31
**Proyecto:** E-Com DistriMM
**Alcance:** Homepage pública + catálogo navegable con 20 productos de prueba

---

## 1. Contexto

DistriMM es un almacén agropecuario en Florencia, Caquetá, distribuidor mayorista de laboratorios veterinarios reconocidos (Virbac, Vecol, Ourofino, Italcol, Solla, Biogénesis). Tiene 4.170 productos en Supabase (`distrimm_productos_catalogo`) pero sin precios. Esta primera versión usa 20 productos hardcodeados con precios reales de referencia e imágenes descargadas de internet.

---

## 2. Stack

| Herramienta | Versión | Rol |
|-------------|---------|-----|
| React | 19 | UI |
| Vite | 7 | Bundler |
| Tailwind CSS | v4 | Estilos |
| React Router | v7 | Navegación |
| pnpm | 10+ | Package manager |
| Supabase JS | ^2 | Cliente (preparado, sin uso en v1) |

---

## 3. Estructura de archivos

```
E-Com DistriMM/
├── public/
│   └── imgs/                    # Imágenes de productos descargadas
├── src/
│   ├── assets/
│   │   └── logo-distrimm.svg    # Logo recreado fielmente
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── Footer.jsx
│   │   ├── ProductCard.jsx
│   │   ├── CategoryFilter.jsx
│   │   └── BrandMarquee.jsx
│   ├── data/
│   │   └── productos.js         # 20 productos hardcodeados
│   ├── pages/
│   │   ├── Home.jsx
│   │   └── Catalogo.jsx
│   ├── lib/
│   │   └── supabase.js
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json
├── vite.config.js
└── tailwind.config.js
```

---

## 4. Rutas

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | Home | Homepage completa |
| `/catalogo` | Catálogo | Todos los productos, filtros activos |
| `/catalogo?categoria=Vacunas` | Catálogo | Pre-filtrado por categoría |
| `/catalogo?marca=VIRBAC` | Catálogo | Pre-filtrado por marca |

No hay ruta de detalle individual — el detalle se muestra en un modal/panel lateral desde el catálogo.

---

## 5. Sistema visual

### Paleta de colores

| Token | Hex | Uso |
|-------|-----|-----|
| `green-deep` | `#1B5232` | Navbar, hero, hover |
| `green-dark` | `#0f3d22` | Footer, secciones profundas |
| `green-mid` | `#2d7a4f` | Gradientes secundarios |
| `gold` | `#F9A825` | CTAs, precios, acentos, marquee |
| `white` | `#ffffff` | Texto sobre verde |
| `gray-bg` | `#f8f9fa` | Fondo catálogo |

### Tipografía
- **Inter** (Google Fonts) — weights 400, 600, 700, 800, 900
- Headings: 900 con letter-spacing ajustado
- Precios: 800, color `gold`

### Logo
- SVG recreado: "ALMACÉN AGROPECUARIO" (naranja/rojo, 9px, uppercase) sobre "DISTRIMM" (verde lima bold, estilizado)
- En navbar: versión horizontal compacta con círculo verde lima + "DM" en verde oscuro

---

## 6. Componentes

### `<Navbar>`
- Sticky, `bg-[#1B5232]`, altura 64px
- Izquierda: logo SVG
- Centro: links (Catálogo, Vacunas, Concentrados, Sales Minerales, Ofertas)
- Derecha: buscador pill + botón WhatsApp dorado

### `<BrandMarquee>`
- Fondo `#F9A825`, scroll automático CSS
- Marcas: VIRBAC · VECOL · CONTEGRAL · OUROFINO · ITALCOL · SOLLA · BIOGENESIS · LHAURA

### `<ProductCard>`
- Imagen cuadrada 1:1 con `object-cover`
- Badge categoría (verde)
- Nombre (bold, 13px, 2 líneas max)
- Marca (uppercase, gris, 10px)
- Precio COP formateado (`Intl.NumberFormat`)
- Botón "Ver más" → abre modal de detalle

### `<CategoryFilter>` (sidebar catálogo)
- Checkboxes por categoría: Agrosemillas, Vacunas, Concentrados, Sales Minerales, Drogas
- Checkboxes por marca: VIRBAC, VECOL, ITALCOL, SOLLA, OUROFINO, BIOGENESIS, BAYER, REFISAL
- Botón "Limpiar filtros"

### `<Footer>`
- Fondo `#0f3d22`
- Col 1: Logo + descripción
- Col 2: Links rápidos
- Col 3: Contacto (313 4835092, Florencia Caquetá, Instagram, Facebook)
- Bottom bar: copyright

---

## 7. Página Home

Secciones en orden:
1. `<Navbar>`
2. **Hero** — gradiente `#0f3d22 → #1B5232 → #2d7a4f`, badge "Florencia, Caquetá · Envío a toda la región", h1 con `agropecuario` en dorado, 2 CTAs, stats (500+ productos, 20+ marcas, B2B, Envío)
3. `<BrandMarquee>`
4. **Categorías** — grid 5 cols, cards blancas con ícono emoji + nombre + conteo
5. **Productos destacados** — 8 primeros productos, `<ProductCard>`, título con underline dorado
6. **Banner B2B** — fondo verde oscuro, beneficios, CTA "Registrarme como Mayorista" → WhatsApp
7. `<Footer>`

---

## 8. Página Catálogo

- Header: título "Catálogo de Productos" + conteo dinámico
- Layout: sidebar izquierdo (280px) + grid derecho (4 cols → 3 cols tablet)
- Buscador en la parte superior del grid
- Filtros en URL query params (`?categoria=X&marca=Y`)
- Sin paginación en v1 (20 productos)
- Modal de detalle: imagen grande, nombre completo, marca, categoría, precio, IVA, botón "Pedir por WhatsApp" que abre `https://wa.me/573134835092?text=Hola, me interesa el producto: {nombre}`

---

## 9. Los 20 productos de prueba

| # | Código | Nombre | Marca | Categoría | Precio |
|---|--------|--------|-------|-----------|--------|
| 1 | AGS-001 | Brachiaria Humidicola x 1kg | AGROSEMILLAS | Agrosemillas | 28.000 |
| 2 | AGS-002 | Panicum Maximum x 1kg | AGROSEMILLAS | Agrosemillas | 22.000 |
| 3 | AGS-003 | Pasto Estrella x 1kg | AGROSEMILLAS | Agrosemillas | 18.500 |
| 4 | AGS-004 | Maíz Híbrido Pioneer x 20kg | PIONEER | Agrosemillas | 145.000 |
| 5 | AGS-005 | Sorgo Forrajero x 25kg | CONTEGRAL | Agrosemillas | 89.000 |
| 6 | VAC-001 | Vacuna Clostrisan 11 x 50 dosis | VIRBAC | Vacunas | 185.000 |
| 7 | VAC-002 | Vacuna Rayovacuna x 50 dosis | VECOL | Vacunas | 95.000 |
| 8 | VAC-003 | Vacuna Biorabia x 25 dosis | BIOGENESIS | Vacunas | 112.000 |
| 9 | DRG-001 | Vitamina B12 x 100ml | OUROFINO | Drogas | 38.000 |
| 10 | DRG-002 | Antibiótico Pen-Estrep x 100ml | VIRBAC | Drogas | 52.000 |
| 11 | DRG-003 | Ivermectina 1% x 500ml | VECOL | Drogas | 78.000 |
| 12 | DRG-004 | Butox 7.5% Antiparasitario x 1L | BAYER | Drogas | 95.000 |
| 13 | DRG-005 | Suero Oral Bovino x 1L | VECOL | Drogas | 24.000 |
| 14 | DRG-006 | Calcio Forte Inyectable x 250ml | OUROFINO | Drogas | 42.000 |
| 15 | CON-001 | Concentrado Lechero 16% x 40kg | ITALCOL | Concentrados | 98.000 |
| 16 | CON-002 | Concentrado Engorde x 40kg | SOLLA | Concentrados | 92.000 |
| 17 | CON-003 | Concentrado Levante Bovino x 40kg | SOLLA | Concentrados | 88.000 |
| 18 | SAL-001 | Sal Mineral Ganadera 10% x 40kg | VECOL | Sales Minerales | 120.000 |
| 19 | SAL-002 | Sal Común Bulto x 50kg | REFISAL | Sales Minerales | 48.000 |
| 20 | SAL-003 | Sal Completa Bovina x 40kg | ITALCOL | Sales Minerales | 135.000 |

Imágenes: descargadas de sitios oficiales de fabricantes y repositorios abiertos, almacenadas en `/public/imgs/`.

---

## 10. Fuera de alcance (v1)

- Carrito de compras
- Checkout / pagos
- Autenticación de usuarios
- Portal B2B con precios diferenciados
- Conexión real a Supabase (productos, precios)
- Página de detalle individual con URL propia
- Versión móvil optimizada (responsive básico sí, pero no prioridad)
