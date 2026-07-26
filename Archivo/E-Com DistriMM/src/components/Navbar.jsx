import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useCart } from '../context/CartContext'
import CartDrawer from './CartDrawer'

const LINKS = [
  { label: 'Catálogo', to: '/catalogo' },
  { label: 'Vacunas', to: '/catalogo?categoria=Vacunas' },
  { label: 'Concentrados', to: '/catalogo?categoria=Concentrados' },
  { label: 'Sales Minerales', to: '/catalogo?categoria=Sales%20Minerales' },
  { label: 'Drogas Vet.', to: '/catalogo?categoria=Drogas' },
  { label: 'Agrosemillas', to: '/catalogo?categoria=Agrosemillas' },
]

const WA_URL = 'https://wa.me/573134835092?text=Hola%20DistriMM%2C%20quiero%20informaci%C3%B3n%20sobre%20sus%20productos'

export default function Navbar() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const { totalItems } = useCart()

  const handleSearch = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      navigate(`/catalogo?q=${encodeURIComponent(e.target.value.trim())}`)
      e.target.value = ''
      setMenuOpen(false)
    }
  }

  return (
    <>
      <nav style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb' }} className="sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between gap-4">

          {/* Logo */}
          <Link to="/" className="shrink-0" onClick={() => setMenuOpen(false)}>
            <img
              src="/imgs/logo-distrimm.png"
              alt="DistriMM Almacén Agropecuario"
              className="h-20 w-auto"
            />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-5 text-sm font-semibold">
            {LINKS.map(({ label, to }) => (
              <Link key={label} to={to} className="text-gray-700 hover:text-green-800 transition-colors whitespace-nowrap">
                {label}
              </Link>
            ))}
          </div>

          {/* Desktop: search + cart + WA */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <input
              type="text"
              placeholder="Buscar producto..."
              onKeyDown={handleSearch}
              className="text-sm px-4 py-1.5 rounded-full border border-gray-300 bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-green-700 w-40"
            />
            <button
              onClick={() => setCartOpen(true)}
              className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Carrito"
            >
              <CartIcon />
              {totalItems > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 flex items-center justify-center rounded-full text-xs font-black px-1"
                  style={{ background: 'var(--gold)', color: 'var(--green-dark)' }}
                >
                  {totalItems}
                </span>
              )}
            </button>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-full text-white transition-opacity hover:opacity-90 whitespace-nowrap"
              style={{ background: '#25D366' }}
            >
              <WAIcon /> WhatsApp
            </a>
          </div>

          {/* Mobile: cart + WA + hamburger */}
          <div className="flex md:hidden items-center gap-1.5 shrink-0">
            <button
              onClick={() => setCartOpen(true)}
              className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Carrito"
            >
              <CartIcon />
              {totalItems > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-black px-0.5"
                  style={{ background: 'var(--gold)', color: 'var(--green-dark)' }}
                >
                  {totalItems}
                </span>
              )}
            </button>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold px-3 py-2 rounded-full text-white"
              style={{ background: '#25D366' }}
            >
              WA
            </a>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Menú"
            >
              {menuOpen ? <XIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <div className="px-4 pt-2 pb-4 flex flex-col">
              {LINKS.map(({ label, to }) => (
                <Link
                  key={label}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className="py-3 text-sm font-semibold text-gray-700 hover:text-green-800 border-b border-gray-100 transition-colors"
                >
                  {label}
                </Link>
              ))}
              <input
                type="text"
                placeholder="🔍 Buscar producto..."
                onKeyDown={handleSearch}
                className="mt-4 w-full text-sm px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none"
              />
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: '#25D366' }}
              >
                <WAIcon /> Contactar por WhatsApp
              </a>
            </div>
          </div>
        )}
      </nav>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  )
}

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h16M3 12h16M3 18h16" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function WAIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
