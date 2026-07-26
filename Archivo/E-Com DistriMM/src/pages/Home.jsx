import { Link } from 'react-router-dom'
import { productos, CATEGORIAS } from '../data/productos'
import BrandMarquee from '../components/BrandMarquee'
import ProductCard from '../components/ProductCard'

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

const WA_MAYORISTA = 'https://wa.me/573134835092?text=Hola%20DistriMM%2C%20quiero%20registrarme%20como%20cliente%20mayorista'

export default function Home() {
  const destacados = productos.slice(0, 8)

  return (
    <div>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white"
        style={{ minHeight: '420px' }}
      >
        {/* Background image — mobile y desktop */}
        <picture className="absolute inset-0">
          <source media="(max-width: 767px)" srcSet="/imgs/hero-campo-mobile.jpg" />
          <source media="(min-width: 768px)" srcSet="/imgs/hero-campo.jpg" />
          <img
            src="/imgs/hero-campo.jpg"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </picture>
        {/* Dark overlay — más fuerte en mobile para legibilidad */}
        <div className="absolute inset-0 md:hidden" style={{ background: 'linear-gradient(to bottom, rgba(15,61,34,0.82) 0%, rgba(15,61,34,0.5) 60%, rgba(15,61,34,0.2) 100%)' }} />
        <div className="absolute inset-0 hidden md:block" style={{ background: 'linear-gradient(to right, rgba(15,61,34,0.85) 0%, rgba(15,61,34,0.6) 50%, rgba(15,61,34,0.15) 100%)' }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 relative z-10">
          <div className="max-w-2xl">
            {/* Badge */}
            <span
              className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-5 tracking-wider uppercase"
              style={{ background: 'var(--red-brand)', color: '#fff' }}
            >
              🌿 Florencia, Caquetá · Almacén Agropecuario
            </span>

            {/* Headline */}
            <h1 className="font-black leading-tight mb-2 uppercase tracking-tight" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
              Tu almacén
            </h1>
            <h1 className="font-black leading-tight mb-2 uppercase tracking-tight" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--green-lime)' }}>
              agropecuario
            </h1>
            <h1 className="font-black leading-tight mb-5 uppercase tracking-tight" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
              ahora en línea
            </h1>

            {/* Tagline */}
            <p className="font-extrabold text-base sm:text-lg mb-2 tracking-wide uppercase" style={{ color: 'var(--gold)' }}>
              Más ahorro · Más calidad · Más producción
            </p>
            <p className="text-white/70 text-sm sm:text-base leading-relaxed mb-8">
              Vacunas, concentrados, sales minerales, agrosemillas y drogas veterinarias — distribuidores mayoristas de los mejores laboratorios del país.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 mb-8">
              <Link
                to="/catalogo"
                className="font-bold px-7 py-3.5 rounded-lg text-sm sm:text-base transition-opacity hover:opacity-90"
                style={{ background: 'var(--gold)', color: 'var(--green-dark)' }}
              >
                Ver Catálogo →
              </Link>
              <a
                href={WA_MAYORISTA}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold px-7 py-3.5 rounded-lg text-sm sm:text-base transition-opacity hover:opacity-90 text-white"
                style={{ background: '#25D366' }}
              >
                Pedir por WhatsApp
              </a>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-6 pt-5 border-t border-white/15">
              {[
                { num: '500+', lbl: 'Productos' },
                { num: '10+', lbl: 'Marcas' },
                { num: 'B2B', lbl: 'Mayoristas' },
                { num: '📦', lbl: 'Envío nacional' },
              ].map(({ num, lbl }) => (
                <div key={lbl}>
                  <div className="text-xl font-black" style={{ color: 'var(--gold)' }}>{num}</div>
                  <div className="text-xs text-white/55 mt-0.5">{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE MARCAS ───────────────────────────────────── */}
      <BrandMarquee />

      {/* ── CATEGORÍAS ───────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold" style={{ color: 'var(--green-deep)' }}>
              Categorías
            </h2>
            <div className="h-0.5 w-10 mt-1.5 rounded" style={{ background: 'var(--gold)' }} />
          </div>
          <Link to="/catalogo" className="text-sm font-semibold hover:underline" style={{ color: 'var(--green-deep)' }}>
            Ver todas →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          {CATEGORIAS.map((cat) => (
            <Link
              key={cat}
              to={`/catalogo?categoria=${encodeURIComponent(cat)}`}
              className="bg-white rounded-xl p-4 sm:p-5 text-center shadow-sm hover:shadow-md transition-all border-2 border-transparent hover:border-green-700 group"
            >
              <div className="text-3xl sm:text-4xl mb-2">{CAT_ICONS[cat]}</div>
              <div className="text-xs sm:text-sm font-bold text-gray-800 group-hover:text-green-800 leading-tight">
                {cat}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{CAT_COUNTS[cat]} productos</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── PRODUCTOS DESTACADOS ─────────────────────────────── */}
      <section style={{ background: 'var(--gray-bg)' }} className="py-10 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold" style={{ color: 'var(--green-deep)' }}>
                Productos Destacados
              </h2>
              <div className="h-0.5 w-10 mt-1.5 rounded" style={{ background: 'var(--gold)' }} />
            </div>
            <Link to="/catalogo" className="text-sm font-semibold hover:underline" style={{ color: 'var(--green-deep)' }}>
              Ver todos →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {destacados.map((p) => (
              <ProductCard key={p.id} producto={p} />
            ))}
          </div>
        </div>
      </section>

      {/* ── BANNER B2B ───────────────────────────────────────── */}
      <section
        className="py-12 sm:py-16"
        style={{ background: 'linear-gradient(135deg, var(--green-dark), var(--green-deep))' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-start md:items-center gap-10">
          <div className="flex-1 text-white">
            <span
              className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-4 tracking-wider uppercase border"
              style={{ color: 'var(--gold)', borderColor: 'rgba(249,168,37,0.4)', background: 'rgba(249,168,37,0.1)' }}
            >
              Portal Mayoristas
            </span>
            <h2 className="text-2xl sm:text-3xl font-black mb-3 uppercase">
              ¿Eres distribuidor o veterinario?
            </h2>
            <p className="text-white/70 text-sm sm:text-base leading-relaxed mb-5">
              Accede a precios especiales por volumen, crédito y atención personalizada para tu negocio agropecuario.
            </p>
            <ul className="flex flex-col gap-2 mb-6">
              {[
                'Precios mayoristas exclusivos',
                'Crédito a 30/60 días',
                'Despacho directo a tu negocio',
                'Asesor comercial dedicado',
              ].map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                    style={{ background: 'var(--gold)', color: 'var(--green-dark)' }}
                  >✓</span>
                  {b}
                </li>
              ))}
            </ul>
            <a
              href={WA_MAYORISTA}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-bold px-8 py-3.5 rounded-lg text-sm sm:text-base transition-opacity hover:opacity-90"
              style={{ background: 'var(--gold)', color: 'var(--green-dark)' }}
            >
              Registrarme como Mayorista →
            </a>
          </div>

          {/* Pricing card — solo desktop */}
          <div className="hidden md:block w-72 shrink-0">
            <div className="rounded-2xl p-5 border border-white/20" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <span className="text-xs font-bold px-2 py-0.5 rounded mb-3 inline-block" style={{ background: 'var(--gold)', color: 'var(--green-dark)' }}>
                EJEMPLO
              </span>
              <p className="text-white font-bold mb-4 text-sm">Vacuna Clostrisan 11 × 50 dosis</p>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center p-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <span className="text-sm text-white/60">Precio público</span>
                  <span className="text-sm text-white/45 line-through">$225.000</span>
                </div>
                <div className="flex justify-between items-center p-2.5 rounded-lg border" style={{ background: 'rgba(249,168,37,0.1)', borderColor: 'rgba(249,168,37,0.3)' }}>
                  <span className="text-sm font-bold text-white">Precio mayorista</span>
                  <span className="text-base font-extrabold" style={{ color: 'var(--gold)' }}>$185.000</span>
                </div>
              </div>
              <p className="text-xs text-white/40 mt-3 text-center">*Precio sujeto a volumen de compra</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
