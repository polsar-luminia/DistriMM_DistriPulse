import { Link } from 'react-router-dom'
import { useState } from 'react'

const CATEGORIAS = [
  { label: 'Agrosemillas', to: '/catalogo?categoria=Agrosemillas' },
  { label: 'Vacunas', to: '/catalogo?categoria=Vacunas' },
  { label: 'Concentrados', to: '/catalogo?categoria=Concentrados' },
  { label: 'Sales Minerales', to: '/catalogo?categoria=Sales%20Minerales' },
  { label: 'Drogas Veterinarias', to: '/catalogo?categoria=Drogas' },
]

const SERVICIOS = [
  { label: 'Catálogo completo', to: '/catalogo' },
  { label: 'Portal Mayoristas', to: '/#mayoristas' },
  { label: 'Precios por volumen', to: '/#mayoristas' },
  { label: 'Distribución regional', to: '/#mayoristas' },
]

function ColToggle({ title, id, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="footer-col">
      <button
        onClick={() => setOpen(!open)}
        className="footer-col-toggle"
        aria-expanded={open}
      >
        <span>{title}</span>
        <svg
          className={`footer-chevron${open ? ' open' : ''}`}
          viewBox="0 0 24 24"
          aria-hidden="true"
          width="16" height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <ul id={id} className={`footer-links${open ? ' open' : ''}`}>
        {children}
      </ul>
    </div>
  )
}

export default function Footer() {
  return (
    <footer className="site-footer">

      <div className="footer-body">

        {/* ── Columna 1: Marca ─────────────────────── */}
        <div className="footer-col footer-col--brand">
          <Link to="/" className="footer-logo-link" aria-label="DistriMM">
            <img
              src="/imgs/logo-distrimm.png"
              alt="DistriMM Almacén Agropecuario"
              className="footer-logo"
              loading="lazy"
            />
          </Link>

          <p className="footer-tagline">
            Distribuidores mayoristas de los laboratorios veterinarios más reconocidos del país. Florencia, Caquetá.
          </p>

          <div className="footer-socials">
            <a
              href="https://www.facebook.com/distrimmalmacenagropecuario"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-social"
              aria-label="Facebook"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 10V7a3 3 0 0 1 3-3h2v3h-2c-.6 0-1 .4-1 1v2h3v3h-3v7h-3v-7h-3v-3z" /></svg>
            </a>
            <a
              href="https://wa.me/573134835092"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-social"
              aria-label="WhatsApp"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
            </a>
          </div>

          <a
            href="https://wa.me/573134835092?text=Hola%20DistriMM%2C%20quiero%20informaci%C3%B3n%20sobre%20sus%20productos"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-wa-btn"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="15" height="15"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
            Pedidos por WhatsApp
          </a>
        </div>

        {/* ── Columna 2: Productos ──────────────────── */}
        <ColToggle title="Productos" id="footer-col-productos">
          {CATEGORIAS.map(({ label, to }) => (
            <li key={label}>
              <Link to={to}>{label}</Link>
            </li>
          ))}
        </ColToggle>

        {/* ── Columna 3: Servicios ──────────────────── */}
        <ColToggle title="Servicios" id="footer-col-servicios">
          {SERVICIOS.map(({ label, to }) => (
            <li key={label}>
              <Link to={to}>{label}</Link>
            </li>
          ))}
        </ColToggle>

        {/* ── Columna 4: Contacto ───────────────────── */}
        <ColToggle title="Contacto" id="footer-col-contacto">
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /></svg>
            <span>Florencia, Caquetá, Colombia</span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            <a href="tel:+573134835092">313 4835092</a>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" /><polyline points="12 6 12 12 16 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <span>Lun – Sáb 8:00 a.m. – 12:30 p.m. / 2:00 – 6:00 p.m.</span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm18 2-10 7L2 6" /></svg>
            <a href="mailto:distrimmalmacen@gmail.com">distrimmalmacen@gmail.com</a>
          </li>
        </ColToggle>

      </div>

      {/* ── Barra inferior ───────────────────────────── */}
      <div className="footer-bottom">
        <p className="footer-copy">
          © {new Date().getFullYear()} DistriMM Almacén Agropecuario — Florencia, Caquetá
        </p>
        <div className="footer-bottom-right">
          <span className="footer-legal">Distribuidores mayoristas · Registro ICA</span>
          <span className="footer-badge">Envío nacional</span>
          <span className="footer-badge footer-badge--outline">B2B Mayoristas</span>
        </div>
      </div>

      <style>{`
        .site-footer {
          background: #ffffff;
          color: #555;
          font-size: 0.875rem;
          border-top: 1px solid #e5e7eb;
        }
        .footer-body {
          max-width: 1280px;
          margin: 0 auto;
          padding: 3rem 1.5rem 2rem;
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
        }
        @media (min-width: 768px) {
          .footer-body {
            grid-template-columns: 1.8fr 1fr 1fr 1.4fr;
            gap: 3.5rem;
            padding: 4rem 1.5rem 3rem;
          }
        }

        /* Columna base */
        .footer-col {
          border-bottom: 1px solid #f0f0f0;
          padding: 1.2rem 0;
        }
        @media (min-width: 768px) {
          .footer-col { border-bottom: none; padding: 0; }
        }

        /* Toggle mobile */
        .footer-col-toggle {
          display: flex;
          width: 100%;
          justify-content: space-between;
          align-items: center;
          background: none;
          border: none;
          color: #111;
          font-weight: 700;
          font-size: 0.875rem;
          padding: 0;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
        }
        @media (min-width: 768px) {
          .footer-col-toggle {
            pointer-events: none;
            margin-bottom: 1.25rem;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #999;
          }
          .footer-chevron { display: none; }
        }
        .footer-chevron {
          flex-shrink: 0;
          color: #aaa;
          transition: transform 0.2s;
        }
        .footer-chevron.open { transform: rotate(180deg); }

        /* Links */
        .footer-links {
          list-style: none;
          margin: 0.5rem 0 0;
          padding: 0;
          overflow: hidden;
          max-height: 0;
          transition: max-height 0.3s ease;
        }
        .footer-links.open { max-height: 400px; }
        @media (min-width: 768px) {
          .footer-links { max-height: none !important; margin: 0; }
        }
        .footer-links li {
          margin-bottom: 0.75rem;
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
        }
        .footer-links li svg {
          width: 14px; height: 14px;
          flex-shrink: 0;
          margin-top: 1px;
          color: var(--green-lime, #4CAF50);
        }
        .footer-links a,
        .footer-links span {
          color: #666;
          text-decoration: none;
          line-height: 1.5;
          transition: color 0.15s;
        }
        .footer-links a:hover { color: var(--green-deep, #1B5232); }

        /* Columna marca */
        .footer-col--brand { padding-bottom: 1.5rem; }
        @media (min-width: 768px) { .footer-col--brand { padding-bottom: 0; } }

        .footer-logo-link { display: inline-block; margin-bottom: 1rem; }
        .footer-logo { display: block; width: 160px; height: auto; }

        .footer-tagline {
          font-size: 0.8125rem;
          line-height: 1.65;
          color: #888;
          margin: 0 0 1.5rem;
          max-width: 260px;
        }

        /* Redes */
        .footer-socials { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
        .footer-social {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px; height: 34px;
          border-radius: 50%;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #888;
          text-decoration: none;
          transition: border-color 0.15s, color 0.15s;
        }
        .footer-social svg { width: 15px; height: 15px; }
        .footer-social:hover { border-color: var(--green-deep, #1B5232); color: var(--green-deep, #1B5232); }

        /* WA button */
        .footer-wa-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.55rem 1.1rem;
          border-radius: 999px;
          background: #25D366;
          color: #fff;
          font-weight: 600;
          font-size: 0.8125rem;
          text-decoration: none;
          transition: opacity 0.15s;
        }
        .footer-wa-btn:hover { opacity: 0.88; }

        /* Barra inferior */
        .footer-bottom {
          border-top: 1px solid #f0f0f0;
          padding: 1.25rem 1.5rem;
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        @media (min-width: 768px) {
          .footer-bottom { flex-direction: row; justify-content: space-between; align-items: center; }
        }
        .footer-copy { margin: 0; font-size: 0.75rem; color: #aaa; }
        .footer-bottom-right { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
        .footer-legal { font-size: 0.7rem; color: #bbb; }
        .footer-badge {
          padding: 0.25rem 0.65rem;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 700;
          background: var(--green-deep, #1B5232);
          color: #fff;
        }
        .footer-badge--outline {
          background: transparent;
          color: var(--green-deep, #1B5232);
          border: 1px solid var(--green-deep, #1B5232);
        }
      `}</style>

    </footer>
  )
}
