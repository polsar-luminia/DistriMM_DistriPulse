# eCommerce DistriMM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir homepage pública + catálogo navegable para DistriMM con 20 productos reales, estética de marca y conexión WhatsApp.

**Architecture:** React 19 + Vite 7 app en `E-Com DistriMM/`. Datos hardcodeados en `src/data/productos.js`. Imágenes descargadas en `public/imgs/`. React Router v7 para navegación. Tailwind v4 con CSS variables para tokens de color.

**Tech Stack:** React 19, Vite 7, Tailwind CSS v4, React Router v7, pnpm

---

## Archivos a crear

```
E-Com DistriMM/
├── public/imgs/              # 20 imágenes descargadas
├── src/
│   ├── assets/logo.svg       # Logo DistriMM SVG
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── Footer.jsx
│   │   ├── BrandMarquee.jsx
│   │   ├── ProductCard.jsx
│   │   ├── ProductModal.jsx
│   │   └── CategoryFilter.jsx
│   ├── data/productos.js
│   ├── pages/
│   │   ├── Home.jsx
│   │   └── Catalogo.jsx
│   ├── lib/supabase.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
└── package.json
```

---

## Task 1: Inicializar proyecto

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/main.jsx`
- Create: `src/index.css`
- Create: `src/lib/supabase.js`

- [ ] **Step 1: Inicializar pnpm e instalar dependencias**

```bash
cd "C:/Users/Santi/OneDrive/Desktop/Desarrollo/Luminia Tech Solutions/E-Com DistriMM"
pnpm init
pnpm add react react-dom react-router-dom @supabase/supabase-js
pnpm add -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Crear `vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 3: Crear `index.html`**

```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DistriMM — Almacén Agropecuario</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Crear `src/index.css`**

```css
@import "tailwindcss";

:root {
  --green-deep: #1B5232;
  --green-dark: #0f3d22;
  --green-mid: #2d7a4f;
  --gold: #F9A825;
  --gray-bg: #f8f9fa;
}

* { font-family: 'Inter', sans-serif; }
body { margin: 0; }

@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.animate-marquee {
  animation: marquee 25s linear infinite;
  display: flex;
  width: max-content;
}
```

- [ ] **Step 5: Crear `src/main.jsx`**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 6: Crear `src/lib/supabase.js`**

```js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY ?? ''

export const supabase = createClient(supabaseUrl, supabaseKey)
```

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: inicializar proyecto eCommerce DistriMM"
```

---

## Task 2: Descargar imágenes de productos

**Files:**
- Create: `public/imgs/` (20 imágenes)

- [ ] **Step 1: Crear directorio y descargar imágenes con curl**

```bash
cd "C:/Users/Santi/OneDrive/Desktop/Desarrollo/Luminia Tech Solutions/E-Com DistriMM"
mkdir -p public/imgs

# Agrosemillas
curl -L "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=400&fit=crop" -o public/imgs/brachiaria.jpg
curl -L "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&h=400&fit=crop" -o public/imgs/panicum.jpg
curl -L "https://images.unsplash.com/photo-1500651230702-0e2d8a49d4e7?w=400&h=400&fit=crop" -o public/imgs/pasto-estrella.jpg
curl -L "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&h=400&fit=crop" -o public/imgs/maiz-hibrido.jpg
curl -L "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=400&h=400&fit=crop" -o public/imgs/sorgo.jpg

# Vacunas y drogas veterinarias
curl -L "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=400&fit=crop" -o public/imgs/clostrisan.jpg
curl -L "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=400&fit=crop" -o public/imgs/rayovacuna.jpg
curl -L "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&h=400&fit=crop" -o public/imgs/biorabia.jpg
curl -L "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=400&fit=crop" -o public/imgs/vitamina-b12.jpg
curl -L "https://images.unsplash.com/photo-1563213126-a4273aed2016?w=400&h=400&fit=crop" -o public/imgs/pen-estrep.jpg
curl -L "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=400&fit=crop" -o public/imgs/ivermectina.jpg
curl -L "https://images.unsplash.com/photo-1583947581924-860bda6a26df?w=400&h=400&fit=crop" -o public/imgs/butox.jpg
curl -L "https://images.unsplash.com/photo-1600508773814-0d45c52cf019?w=400&h=400&fit=crop" -o public/imgs/suero-oral.jpg
curl -L "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&h=400&fit=crop" -o public/imgs/calcio-forte.jpg

# Concentrados
curl -L "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop" -o public/imgs/concentrado-lechero.jpg
curl -L "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=400&h=400&fit=crop" -o public/imgs/concentrado-engorde.jpg
curl -L "https://images.unsplash.com/photo-1595273670150-bd0c3c392e46?w=400&h=400&fit=crop" -o public/imgs/concentrado-levante.jpg

# Sales minerales
curl -L "https://images.unsplash.com/photo-1518732714860-b62714ce0c59?w=400&h=400&fit=crop" -o public/imgs/sal-mineral.jpg
curl -L "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=400&h=400&fit=crop" -o public/imgs/sal-comun.jpg
curl -L "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=400&fit=crop" -o public/imgs/sal-completa.jpg
```

- [ ] **Step 2: Verificar que se descargaron**

```bash
ls public/imgs/ | wc -l
```
Expected: `20`

- [ ] **Step 3: Commit**

```bash
git add public/imgs/
git commit -m "feat: agregar imágenes de productos"
```

---

## Task 3: Logo SVG + datos de productos

**Files:**
- Create: `src/assets/logo.svg`
- Create: `src/data/productos.js`

- [ ] **Step 1: Crear `src/assets/logo.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
  <!-- Círculo fondo -->
  <circle cx="30" cy="30" r="28" fill="#F9A825"/>
  <!-- Letras DM en círculo -->
  <text x="30" y="36" font-family="Inter,sans-serif" font-weight="900" font-size="16" fill="#1B5232" text-anchor="middle">DM</text>
  <!-- Texto derecho -->
  <text x="66" y="22" font-family="Inter,sans-serif" font-weight="700" font-size="8" fill="#e57c00" letter-spacing="2">ALMACÉN AGROPECUARIO</text>
  <text x="66" y="42" font-family="Inter,sans-serif" font-weight="900" font-size="22" fill="#4CAF50" letter-spacing="1">DISTRIMM</text>
</svg>
```

- [ ] **Step 2: Crear `src/data/productos.js`**

```js
export const CATEGORIAS = [
  'Agrosemillas',
  'Vacunas',
  'Drogas',
  'Concentrados',
  'Sales Minerales',
]

export const MARCAS = [
  'AGROSEMILLAS', 'PIONEER', 'CONTEGRAL',
  'VIRBAC', 'VECOL', 'BIOGENESIS',
  'OUROFINO', 'BAYER', 'REFISAL',
  'ITALCOL', 'SOLLA',
]

export const productos = [
  {
    id: 'AGS-001',
    nombre: 'Brachiaria Humidicola x 1kg',
    marca: 'AGROSEMILLAS',
    categoria: 'Agrosemillas',
    precio: 28000,
    pct_iva: 0,
    imagen: '/imgs/brachiaria.jpg',
    descripcion: 'Semilla certificada de pasto Brachiaria Humidicola, ideal para ganadería en zonas tropicales. Alta producción de forraje y excelente palatabilidad.',
  },
  {
    id: 'AGS-002',
    nombre: 'Panicum Maximum x 1kg',
    marca: 'AGROSEMILLAS',
    categoria: 'Agrosemillas',
    precio: 22000,
    pct_iva: 0,
    imagen: '/imgs/panicum.jpg',
    descripcion: 'Pasto Guinea o Panicum Maximum, de alta productividad y adaptación a suelos bien drenados. Excelente para bovinos de leche y carne.',
  },
  {
    id: 'AGS-003',
    nombre: 'Pasto Estrella x 1kg',
    marca: 'AGROSEMILLAS',
    categoria: 'Agrosemillas',
    precio: 18500,
    pct_iva: 0,
    imagen: '/imgs/pasto-estrella.jpg',
    descripcion: 'Cynodon plectostachyus, pasto de alta producción para corte y pastoreo. Tolerante a la sequía y de rápida recuperación.',
  },
  {
    id: 'AGS-004',
    nombre: 'Maíz Híbrido Pioneer x 20kg',
    marca: 'PIONEER',
    categoria: 'Agrosemillas',
    precio: 145000,
    pct_iva: 0,
    imagen: '/imgs/maiz-hibrido.jpg',
    descripcion: 'Semilla híbrida de maíz para uso forrajero y grano. Alta adaptación a climas tropicales, resistente a enfermedades foliares.',
  },
  {
    id: 'AGS-005',
    nombre: 'Sorgo Forrajero x 25kg',
    marca: 'CONTEGRAL',
    categoria: 'Agrosemillas',
    precio: 89000,
    pct_iva: 0,
    imagen: '/imgs/sorgo.jpg',
    descripcion: 'Sorgo forrajero de doble propósito: grano y ensilaje. Alta resistencia a la sequía y excelente valor nutritivo.',
  },
  {
    id: 'VAC-001',
    nombre: 'Vacuna Clostrisan 11 x 50 dosis',
    marca: 'VIRBAC',
    categoria: 'Vacunas',
    precio: 185000,
    pct_iva: 0,
    imagen: '/imgs/clostrisan.jpg',
    descripcion: 'Vacuna polivalente contra 11 cepas de clostridios. Protección completa para bovinos, ovinos y caprinos. Refrigerar entre 2-8°C.',
  },
  {
    id: 'VAC-002',
    nombre: 'Vacuna Rayovacuna x 50 dosis',
    marca: 'VECOL',
    categoria: 'Vacunas',
    precio: 95000,
    pct_iva: 0,
    imagen: '/imgs/rayovacuna.jpg',
    descripcion: 'Vacuna antiaftosa bivalente producida por VECOL. Uso obligatorio según calendario sanitario ICA. Conservar en cadena de frío.',
  },
  {
    id: 'VAC-003',
    nombre: 'Vacuna Biorabia x 25 dosis',
    marca: 'BIOGENESIS',
    categoria: 'Vacunas',
    precio: 112000,
    pct_iva: 0,
    imagen: '/imgs/biorabia.jpg',
    descripcion: 'Vacuna antirrábica inactivada para bovinos. Protección durante 12 meses. Requiere prescripción veterinaria.',
  },
  {
    id: 'DRG-001',
    nombre: 'Vitamina B12 x 100ml',
    marca: 'OUROFINO',
    categoria: 'Drogas',
    precio: 38000,
    pct_iva: 0,
    imagen: '/imgs/vitamina-b12.jpg',
    descripcion: 'Cianocobalamina inyectable al 0.1%. Tratamiento de anemias y deficiencias nutricionales en bovinos. Uso intramuscular o subcutáneo.',
  },
  {
    id: 'DRG-002',
    nombre: 'Antibiótico Pen-Estrep x 100ml',
    marca: 'VIRBAC',
    categoria: 'Drogas',
    precio: 52000,
    pct_iva: 0,
    imagen: '/imgs/pen-estrep.jpg',
    descripcion: 'Asociación penicilina-estreptomicina para infecciones bacterianas en bovinos. Amplio espectro antibacteriano. Uso bajo prescripción.',
  },
  {
    id: 'DRG-003',
    nombre: 'Ivermectina 1% x 500ml',
    marca: 'VECOL',
    categoria: 'Drogas',
    precio: 78000,
    pct_iva: 0,
    imagen: '/imgs/ivermectina.jpg',
    descripcion: 'Antiparasitario interno y externo de amplio espectro. Controla parásitos gastrointestinales, pulmonares y ectoparásitos en bovinos.',
  },
  {
    id: 'DRG-004',
    nombre: 'Butox 7.5% Antiparasitario x 1L',
    marca: 'BAYER',
    categoria: 'Drogas',
    precio: 95000,
    pct_iva: 0,
    imagen: '/imgs/butox.jpg',
    descripcion: 'Deltametrina 7.5% pour-on. Control de garrapatas, moscas y otros ectoparásitos en bovinos. Aplicación tópica, sin retiro para leche.',
  },
  {
    id: 'DRG-005',
    nombre: 'Suero Oral Bovino x 1L',
    marca: 'VECOL',
    categoria: 'Drogas',
    precio: 24000,
    pct_iva: 0,
    imagen: '/imgs/suero-oral.jpg',
    descripcion: 'Solución electrolítica oral para rehidratación de terneros con diarrea. Contiene glucosa, sodio, potasio y bicarbonato.',
  },
  {
    id: 'DRG-006',
    nombre: 'Calcio Forte Inyectable x 250ml',
    marca: 'OUROFINO',
    categoria: 'Drogas',
    precio: 42000,
    pct_iva: 0,
    imagen: '/imgs/calcio-forte.jpg',
    descripcion: 'Solución inyectable de calcio, fósforo y magnesio. Tratamiento de hipocalcemia puerperal (fiebre de leche) en bovinos.',
  },
  {
    id: 'CON-001',
    nombre: 'Concentrado Lechero 16% x 40kg',
    marca: 'ITALCOL',
    categoria: 'Concentrados',
    precio: 98000,
    pct_iva: 0,
    imagen: '/imgs/concentrado-lechero.jpg',
    descripcion: 'Alimento concentrado con 16% de proteína para vacas en producción. Formulado con maíz, soya y minerales quelados para máxima producción láctea.',
  },
  {
    id: 'CON-002',
    nombre: 'Concentrado Engorde x 40kg',
    marca: 'SOLLA',
    categoria: 'Concentrados',
    precio: 92000,
    pct_iva: 0,
    imagen: '/imgs/concentrado-engorde.jpg',
    descripcion: 'Alimento para bovinos en etapa de ceba. Alta energía y proteína para máxima ganancia de peso diaria. Incluye promotores de crecimiento.',
  },
  {
    id: 'CON-003',
    nombre: 'Concentrado Levante Bovino x 40kg',
    marca: 'SOLLA',
    categoria: 'Concentrados',
    precio: 88000,
    pct_iva: 0,
    imagen: '/imgs/concentrado-levante.jpg',
    descripcion: 'Concentrado para terneros y novillos en levante. Balanceado en aminoácidos esenciales para desarrollo óseo y muscular óptimo.',
  },
  {
    id: 'SAL-001',
    nombre: 'Sal Mineral Ganadera 10% x 40kg',
    marca: 'VECOL',
    categoria: 'Sales Minerales',
    precio: 120000,
    pct_iva: 0,
    imagen: '/imgs/sal-mineral.jpg',
    descripcion: 'Sal mineralizada con 10% de fósforo. Suplemento mineral completo para bovinos en pastoreo. Previene deficiencias de calcio, fósforo y oligoelementos.',
  },
  {
    id: 'SAL-002',
    nombre: 'Sal Común Bulto x 50kg',
    marca: 'REFISAL',
    categoria: 'Sales Minerales',
    precio: 48000,
    pct_iva: 0,
    imagen: '/imgs/sal-comun.jpg',
    descripcion: 'Sal de cocina granulada para consumo animal. Esencial para regulación hídrica y osmótica. Uso en saladeros de libre acceso.',
  },
  {
    id: 'SAL-003',
    nombre: 'Sal Completa Bovina x 40kg',
    marca: 'ITALCOL',
    categoria: 'Sales Minerales',
    precio: 135000,
    pct_iva: 0,
    imagen: '/imgs/sal-completa.jpg',
    descripcion: 'Suplemento mineral completo con vitaminas A, D3 y E. Formulado para bovinos de leche y carne. Mejora reproducción y sistema inmune.',
  },
]

export const formatCOP = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor)
```

- [ ] **Step 3: Commit**

```bash
git add src/assets/logo.svg src/data/productos.js
git commit -m "feat: agregar logo SVG y datos de 20 productos"
```

---

## Task 4: Componentes base — Navbar y Footer

**Files:**
- Create: `src/components/Navbar.jsx`
- Create: `src/components/Footer.jsx`

- [ ] **Step 1: Crear `src/components/Navbar.jsx`**

```jsx
import { Link, useNavigate } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()

  const handleSearch = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      navigate(`/catalogo?q=${encodeURIComponent(e.target.value.trim())}`)
      e.target.value = ''
    }
  }

  return (
    <nav style={{ background: 'var(--green-deep)' }} className="sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <div style={{ background: 'var(--gold)' }} className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm" style={{ color: 'var(--green-deep)', background: 'var(--gold)' }}>
            DM
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[9px] font-semibold tracking-[3px] uppercase" style={{ color: '#e8b84b' }}>
              ALMACÉN AGROPECUARIO
            </span>
            <span className="text-lg font-black tracking-wide text-white">
              DISTRI<span style={{ color: '#4CAF50' }}>MM</span>
            </span>
          </div>
        </Link>

        {/* Links */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          {[
            { label: 'Catálogo', to: '/catalogo' },
            { label: 'Vacunas', to: '/catalogo?categoria=Vacunas' },
            { label: 'Concentrados', to: '/catalogo?categoria=Concentrados' },
            { label: 'Sales Minerales', to: '/catalogo?categoria=Sales%20Minerales' },
            { label: 'Ofertas', to: '/catalogo' },
          ].map(({ label, to }) => (
            <Link key={label} to={to} className="text-white/80 hover:text-yellow-400 transition-colors">
              {label}
            </Link>
          ))}
        </div>

        {/* Derecha */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="🔍 Buscar producto..."
            onKeyDown={handleSearch}
            className="hidden md:block text-sm px-4 py-1.5 rounded-full border border-white/20 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:border-yellow-400 w-44"
          />
          <a
            href="https://wa.me/573134835092?text=Hola, quiero información sobre sus productos"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold px-4 py-2 rounded-full flex items-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: 'var(--gold)', color: 'var(--green-deep)' }}
          >
            WhatsApp
          </a>
        </div>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Crear `src/components/Footer.jsx`**

```jsx
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer style={{ background: 'var(--green-dark)' }}>
      <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">

        {/* Col 1: Marca */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0" style={{ background: 'var(--gold)', color: 'var(--green-deep)' }}>
              DM
            </div>
            <div className="leading-none">
              <div className="text-[9px] tracking-[2px] uppercase" style={{ color: '#e8b84b' }}>ALMACÉN AGROPECUARIO</div>
              <div className="text-lg font-black text-white">DISTRI<span style={{ color: '#4CAF50' }}>MM</span></div>
            </div>
          </div>
          <p className="text-white/60 leading-relaxed">
            Distribuidores mayoristas de los laboratorios veterinarios más reconocidos del país. Florencia, Caquetá.
          </p>
        </div>

        {/* Col 2: Links */}
        <div>
          <h4 className="text-white font-bold mb-4">Productos</h4>
          <div className="flex flex-col gap-2">
            {['Agrosemillas', 'Vacunas', 'Concentrados', 'Sales Minerales', 'Drogas'].map((cat) => (
              <Link key={cat} to={`/catalogo?categoria=${encodeURIComponent(cat)}`} className="text-white/60 hover:text-yellow-400 transition-colors">
                {cat}
              </Link>
            ))}
          </div>
        </div>

        {/* Col 3: Contacto */}
        <div>
          <h4 className="text-white font-bold mb-4">Contacto</h4>
          <div className="flex flex-col gap-2 text-white/60">
            <span>📍 Florencia, Caquetá</span>
            <a href="tel:+573134835092" className="hover:text-yellow-400 transition-colors">📞 313 4835092</a>
            <a href="https://wa.me/573134835092" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-400 transition-colors">💬 WhatsApp</a>
            <a href="https://www.facebook.com/distrimmalmacenagropecuario" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-400 transition-colors">📘 Facebook</a>
            <span>📧 distrimmalmacen@gmail.com</span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-6 py-4 max-w-7xl mx-auto flex justify-between text-xs text-white/40">
        <span>© 2026 DistriMM Almacén Agropecuario. Todos los derechos reservados.</span>
        <span>Florencia · Caquetá · Colombia</span>
      </div>
    </footer>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Navbar.jsx src/components/Footer.jsx
git commit -m "feat: agregar Navbar y Footer"
```

---

## Task 5: BrandMarquee y ProductCard

**Files:**
- Create: `src/components/BrandMarquee.jsx`
- Create: `src/components/ProductCard.jsx`

- [ ] **Step 1: Crear `src/components/BrandMarquee.jsx`**

```jsx
const MARCAS = [
  { nombre: 'VIRBAC', emoji: '🧬' },
  { nombre: 'VECOL', emoji: '🏭' },
  { nombre: 'CONTEGRAL', emoji: '🌾' },
  { nombre: 'OUROFINO', emoji: '💊' },
  { nombre: 'ITALCOL', emoji: '🐄' },
  { nombre: 'SOLLA', emoji: '🐂' },
  { nombre: 'BIOGENESIS', emoji: '🔬' },
  { nombre: 'LHAURA', emoji: '🩺' },
  { nombre: 'BAYER', emoji: '⚗️' },
  { nombre: 'PIONEER', emoji: '🌽' },
]

export default function BrandMarquee() {
  const items = [...MARCAS, ...MARCAS]

  return (
    <div style={{ background: 'var(--gold)' }} className="py-2.5 overflow-hidden">
      <div className="animate-marquee">
        {items.map((m, i) => (
          <span key={i} className="flex items-center gap-2 px-8 text-sm font-bold whitespace-nowrap" style={{ color: 'var(--green-deep)' }}>
            <span>{m.emoji}</span>
            <span>{m.nombre}</span>
            <span className="opacity-40 ml-4">·</span>
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crear `src/components/ProductCard.jsx`**

```jsx
import { formatCOP } from '../data/productos'

export default function ProductCard({ producto, onClick }) {
  return (
    <div
      onClick={() => onClick(producto)}
      className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group border border-transparent hover:border-green-700"
    >
      {/* Imagen */}
      <div className="relative h-44 bg-gray-50 overflow-hidden">
        <img
          src={producto.imagen}
          alt={producto.nombre}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { e.target.src = 'https://placehold.co/400x400/1B5232/F9A825?text=DistriMM' }}
        />
        <span className="absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'var(--green-deep)' }}>
          {producto.categoria}
        </span>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase mb-1">
          {producto.marca}
        </p>
        <h3 className="text-sm font-bold text-gray-800 leading-tight line-clamp-2 mb-3 min-h-[2.5rem]">
          {producto.nombre}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-base font-extrabold" style={{ color: 'var(--green-deep)' }}>
            {formatCOP(producto.precio)}
          </span>
          <button
            className="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--gold)', color: 'var(--green-deep)' }}
          >
            Ver más
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/BrandMarquee.jsx src/components/ProductCard.jsx
git commit -m "feat: agregar BrandMarquee y ProductCard"
```

---

## Task 6: ProductModal y CategoryFilter

**Files:**
- Create: `src/components/ProductModal.jsx`
- Create: `src/components/CategoryFilter.jsx`

- [ ] **Step 1: Crear `src/components/ProductModal.jsx`**

```jsx
import { useEffect } from 'react'
import { formatCOP } from '../data/productos'

export default function ProductModal({ producto, onClose }) {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!producto) return null

  const waText = encodeURIComponent(`Hola DistriMM, me interesa el producto: *${producto.nombre}* (Ref: ${producto.id}). ¿Tienen disponibilidad?`)
  const waUrl = `https://wa.me/573134835092?text=${waText}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
        {/* Imagen */}
        <div className="relative h-56 bg-gray-50">
          <img
            src={producto.imagen}
            alt={producto.nombre}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.src = 'https://placehold.co/600x400/1B5232/F9A825?text=DistriMM' }}
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center font-bold text-gray-600 hover:bg-white transition-colors text-lg leading-none"
          >
            ×
          </button>
          <span className="absolute top-3 left-3 text-xs font-bold px-3 py-1 rounded-full text-white" style={{ background: 'var(--green-deep)' }}>
            {producto.categoria}
          </span>
        </div>

        {/* Contenido */}
        <div className="p-6">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">{producto.marca}</p>
          <h2 className="text-xl font-extrabold text-gray-900 mb-2">{producto.nombre}</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{producto.descripcion}</p>

          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Precio de referencia</p>
              <p className="text-2xl font-black" style={{ color: 'var(--green-deep)' }}>
                {formatCOP(producto.precio)}
              </p>
              {producto.pct_iva > 0 && (
                <p className="text-xs text-gray-400">+ IVA {producto.pct_iva}%</p>
              )}
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Ref: {producto.id}</span>
          </div>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-base transition-opacity hover:opacity-90"
            style={{ background: '#25D366', color: 'white' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Pedir por WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crear `src/components/CategoryFilter.jsx`**

```jsx
export default function CategoryFilter({ categorias, marcas, filtros, onChange }) {
  const toggle = (tipo, valor) => {
    const actual = filtros[tipo] ?? []
    const nuevo = actual.includes(valor)
      ? actual.filter((v) => v !== valor)
      : [...actual, valor]
    onChange({ ...filtros, [tipo]: nuevo })
  }

  const limpiar = () => onChange({ categorias: [], marcas: [] })
  const total = (filtros.categorias?.length ?? 0) + (filtros.marcas?.length ?? 0)

  return (
    <aside className="w-64 shrink-0">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 sticky top-20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">Filtros</h3>
          {total > 0 && (
            <button onClick={limpiar} className="text-xs font-semibold hover:underline" style={{ color: 'var(--green-deep)' }}>
              Limpiar ({total})
            </button>
          )}
        </div>

        {/* Por categoría */}
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Categoría</p>
          <div className="flex flex-col gap-1.5">
            {categorias.map((cat) => (
              <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filtros.categorias?.includes(cat) ?? false}
                  onChange={() => toggle('categorias', cat)}
                  className="rounded accent-green-800"
                />
                <span className="text-sm text-gray-700 group-hover:text-green-800">{cat}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Por marca */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Marca</p>
          <div className="flex flex-col gap-1.5">
            {marcas.map((marca) => (
              <label key={marca} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filtros.marcas?.includes(marca) ?? false}
                  onChange={() => toggle('marcas', marca)}
                  className="rounded accent-green-800"
                />
                <span className="text-sm text-gray-700 group-hover:text-green-800">{marca}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ProductModal.jsx src/components/CategoryFilter.jsx
git commit -m "feat: agregar ProductModal y CategoryFilter"
```

---

## Task 7: Página Home

**Files:**
- Create: `src/pages/Home.jsx`

- [ ] **Step 1: Crear `src/pages/Home.jsx`**

```jsx
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { productos, CATEGORIAS } from '../data/productos'
import BrandMarquee from '../components/BrandMarquee'
import ProductCard from '../components/ProductCard'
import ProductModal from '../components/ProductModal'

const CAT_ICONS = {
  'Agrosemillas': '🌱',
  'Vacunas': '💉',
  'Drogas': '💊',
  'Concentrados': '🌾',
  'Sales Minerales': '🧂',
}

const CAT_COUNTS = CATEGORIAS.reduce((acc, cat) => {
  acc[cat] = productos.filter((p) => p.categoria === cat).length
  return acc
}, {})

export default function Home() {
  const [modalProducto, setModalProducto] = useState(null)
  const destacados = productos.slice(0, 8)

  return (
    <div>
      {/* HERO */}
      <section
        className="text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--green-dark) 0%, var(--green-deep) 50%, var(--green-mid) 100%)', minHeight: '440px' }}
      >
        {/* Círculo decorativo */}
        <div className="absolute right-0 top-0 w-96 h-96 rounded-full opacity-10" style={{ background: 'var(--gold)', transform: 'translate(30%, -30%)' }} />

        <div className="max-w-7xl mx-auto px-6 py-16 flex items-center gap-12 relative z-10">
          {/* Contenido */}
          <div className="flex-1 max-w-xl">
            <span className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-4 tracking-wider uppercase" style={{ background: 'var(--gold)', color: 'var(--green-deep)' }}>
              🌿 Florencia, Caquetá · Envío a toda la región
            </span>
            <h1 className="text-5xl font-black leading-tight mb-4">
              Tu almacén<br />
              <span style={{ color: 'var(--gold)' }}>agropecuario</span><br />
              ahora en línea
            </h1>
            <p className="text-white/80 text-lg leading-relaxed mb-8">
              Vacunas, concentrados, sales minerales y más de 500 productos de los mejores laboratorios veterinarios del país.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link
                to="/catalogo"
                className="font-bold px-7 py-3.5 rounded-lg text-base transition-opacity hover:opacity-90"
                style={{ background: 'var(--gold)', color: 'var(--green-deep)' }}
              >
                Ver Catálogo →
              </Link>
              <a
                href="https://wa.me/573134835092?text=Hola, soy mayorista y quiero información sobre precios"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold px-7 py-3.5 rounded-lg text-base border-2 border-white/40 text-white hover:border-white transition-colors"
              >
                Portal Mayoristas
              </a>
            </div>

            {/* Stats */}
            <div className="flex gap-8 mt-8 pt-6 border-t border-white/15">
              {[
                { num: '500+', lbl: 'Productos' },
                { num: '20+', lbl: 'Marcas' },
                { num: 'B2B', lbl: 'Precios Mayorista' },
                { num: '📦', lbl: 'Envío a domicilio' },
              ].map(({ num, lbl }) => (
                <div key={lbl} className="text-center">
                  <div className="text-xl font-black" style={{ color: 'var(--gold)' }}>{num}</div>
                  <div className="text-xs text-white/60">{lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Imagen hero */}
          <div className="hidden lg:block flex-1 max-w-sm">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10 h-64">
              <img
                src="/imgs/concentrado-lechero.jpg"
                alt="Productos agropecuarios DistriMM"
                className="w-full h-full object-cover opacity-80"
                onError={(e) => { e.target.src = 'https://placehold.co/400x280/2d7a4f/F9A825?text=DistriMM' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <BrandMarquee />

      {/* CATEGORÍAS */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h2 className="text-2xl font-extrabold" style={{ color: 'var(--green-deep)' }}>Categorías</h2>
            <div className="h-0.5 w-10 mt-1.5 rounded" style={{ background: 'var(--gold)' }} />
          </div>
          <Link to="/catalogo" className="text-sm font-semibold hover:underline" style={{ color: 'var(--green-deep)' }}>
            Ver todas →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {CATEGORIAS.map((cat) => (
            <Link
              key={cat}
              to={`/catalogo?categoria=${encodeURIComponent(cat)}`}
              className="bg-white rounded-xl p-5 text-center shadow-sm hover:shadow-md transition-all border-2 border-transparent hover:border-green-700 group"
            >
              <div className="text-4xl mb-2">{CAT_ICONS[cat]}</div>
              <div className="text-sm font-bold text-gray-800 group-hover:text-green-800">{cat}</div>
              <div className="text-xs text-gray-400 mt-0.5">{CAT_COUNTS[cat]} productos</div>
            </Link>
          ))}
        </div>
      </section>

      {/* PRODUCTOS DESTACADOS */}
      <section style={{ background: 'var(--gray-bg)' }} className="py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <h2 className="text-2xl font-extrabold" style={{ color: 'var(--green-deep)' }}>Productos Destacados</h2>
              <div className="h-0.5 w-10 mt-1.5 rounded" style={{ background: 'var(--gold)' }} />
            </div>
            <Link to="/catalogo" className="text-sm font-semibold hover:underline" style={{ color: 'var(--green-deep)' }}>
              Ver todos →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {destacados.map((p) => (
              <ProductCard key={p.id} producto={p} onClick={setModalProducto} />
            ))}
          </div>
        </div>
      </section>

      {/* BANNER B2B */}
      <section style={{ background: 'linear-gradient(135deg, var(--green-dark), var(--green-deep))' }} className="py-14">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-12">
          <div className="flex-1 text-white">
            <span className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-3 border tracking-wider" style={{ color: 'var(--gold)', borderColor: 'rgba(249,168,37,0.4)', background: 'rgba(249,168,37,0.1)' }}>
              PORTAL MAYORISTAS
            </span>
            <h2 className="text-3xl font-black mb-3">¿Eres distribuidor o veterinario?</h2>
            <p className="text-white/75 text-base leading-relaxed mb-5">
              Accede a precios especiales por volumen, crédito y atención personalizada para tu negocio.
            </p>
            <ul className="flex flex-col gap-2 mb-6">
              {['Precios mayoristas exclusivos', 'Crédito a 30/60 días', 'Despacho directo a tu negocio', 'Asesor comercial dedicado'].map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ background: 'var(--gold)', color: 'var(--green-deep)' }}>✓</span>
                  {b}
                </li>
              ))}
            </ul>
            <a
              href="https://wa.me/573134835092?text=Hola, quiero registrarme como cliente mayorista de DistriMM"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-bold px-8 py-3.5 rounded-lg text-base transition-opacity hover:opacity-90"
              style={{ background: 'var(--gold)', color: 'var(--green-deep)' }}
            >
              Registrarme como Mayorista →
            </a>
          </div>

          {/* Card precio comparativo */}
          <div className="hidden md:block w-72 shrink-0">
            <div className="rounded-2xl p-5 border border-white/20" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <span className="text-xs font-bold px-2 py-0.5 rounded mb-3 inline-block" style={{ background: 'var(--gold)', color: 'var(--green-deep)' }}>EJEMPLO</span>
              <p className="text-white font-bold mb-3">Vacuna Clostrisan 11 x 50 dosis</p>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center p-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <span className="text-sm text-white/70">Precio público</span>
                  <span className="text-sm text-white/60 line-through">$225.000</span>
                </div>
                <div className="flex justify-between items-center p-2.5 rounded-lg border" style={{ background: 'rgba(249,168,37,0.12)', borderColor: 'rgba(249,168,37,0.3)' }}>
                  <span className="text-sm font-bold text-white">Precio mayorista</span>
                  <span className="text-base font-extrabold" style={{ color: 'var(--gold)' }}>$185.000</span>
                </div>
              </div>
              <p className="text-xs text-white/50 mt-3 text-center">*Precio sujeto a volumen de compra</p>
            </div>
          </div>
        </div>
      </section>

      {/* MODAL */}
      <ProductModal producto={modalProducto} onClose={() => setModalProducto(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Home.jsx
git commit -m "feat: agregar página Home completa"
```

---

## Task 8: Página Catálogo

**Files:**
- Create: `src/pages/Catalogo.jsx`

- [ ] **Step 1: Crear `src/pages/Catalogo.jsx`**

```jsx
import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { productos, CATEGORIAS, MARCAS } from '../data/productos'
import ProductCard from '../components/ProductCard'
import ProductModal from '../components/ProductModal'
import CategoryFilter from '../components/CategoryFilter'

export default function Catalogo() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [modalProducto, setModalProducto] = useState(null)
  const [busqueda, setBusqueda] = useState(searchParams.get('q') ?? '')

  const categoriaURL = searchParams.get('categoria')
  const [filtros, setFiltros] = useState({
    categorias: categoriaURL ? [categoriaURL] : [],
    marcas: [],
  })

  const handleFiltros = (nuevosFiltros) => {
    setFiltros(nuevosFiltros)
    const params = new URLSearchParams()
    if (nuevosFiltros.categorias.length === 1) params.set('categoria', nuevosFiltros.categorias[0])
    setSearchParams(params)
  }

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const matchBusqueda = busqueda === '' ||
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.marca.toLowerCase().includes(busqueda.toLowerCase())
      const matchCat = filtros.categorias.length === 0 || filtros.categorias.includes(p.categoria)
      const matchMarca = filtros.marcas.length === 0 || filtros.marcas.includes(p.marca)
      return matchBusqueda && matchCat && matchMarca
    })
  }, [busqueda, filtros])

  const marcasDisponibles = [...new Set(productos.map((p) => p.marca))].sort()

  return (
    <div style={{ background: 'var(--gray-bg)', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: 'var(--green-deep)' }} className="py-8 px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-black text-white mb-1">Catálogo de Productos</h1>
          <p className="text-white/70 text-sm">{productosFiltrados.length} productos encontrados</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-6 items-start">
        {/* Sidebar */}
        <CategoryFilter
          categorias={CATEGORIAS}
          marcas={marcasDisponibles}
          filtros={filtros}
          onChange={handleFiltros}
        />

        {/* Contenido principal */}
        <div className="flex-1 min-w-0">
          {/* Buscador */}
          <div className="mb-5">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="🔍 Buscar por nombre o marca..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm focus:outline-none focus:border-green-700 focus:ring-2 focus:ring-green-700/20"
            />
          </div>

          {/* Grid */}
          {productosFiltrados.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {productosFiltrados.map((p) => (
                <ProductCard key={p.id} producto={p} onClick={setModalProducto} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-gray-500 font-semibold">No encontramos productos con ese filtro</p>
              <button
                onClick={() => { setBusqueda(''); handleFiltros({ categorias: [], marcas: [] }) }}
                className="mt-3 text-sm font-bold hover:underline"
                style={{ color: 'var(--green-deep)' }}
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      </div>

      <ProductModal producto={modalProducto} onClose={() => setModalProducto(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Catalogo.jsx
git commit -m "feat: agregar página Catálogo con filtros y búsqueda"
```

---

## Task 9: App.jsx + routing + actualizar launch.json

**Files:**
- Create: `src/App.jsx`
- Modify: `.claude/launch.json`

- [ ] **Step 1: Crear `src/App.jsx`**

```jsx
import { createBrowserRouter, RouterProvider, Outlet, ScrollRestoration } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Catalogo from './pages/Catalogo'

function Layout() {
  return (
    <>
      <ScrollRestoration />
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'catalogo', element: <Catalogo /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
```

- [ ] **Step 2: Actualizar `.claude/launch.json` para la nueva app**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "ecom-distrimm",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["run", "dev", "--port", "5174"],
      "port": 5174
    }
  ]
}
```

- [ ] **Step 3: Commit final**

```bash
git add src/App.jsx .claude/launch.json
git commit -m "feat: routing completo, app lista para producción"
```

- [ ] **Step 4: Arrancar y verificar en preview**

```bash
pnpm run dev --port 5174
```

Navegar a `http://localhost:5174/` y verificar:
- Homepage carga con hero, marquee, categorías, 8 productos, banner B2B
- Click en producto → modal con botón WhatsApp
- Navegar a `/catalogo` → 20 productos, filtros funcionales, buscador activo
- Filtrar por "Vacunas" → solo vacunas visibles
