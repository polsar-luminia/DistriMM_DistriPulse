import { Link } from 'react-router-dom'
import { useState } from 'react'
import { formatCOP } from '../data/productos'
import { useCart } from '../context/CartContext'

export default function ProductCard({ producto }) {
  const { addItem } = useCart()
  const [agregado, setAgregado] = useState(false)

  const handleAgregar = (e) => {
    e.preventDefault()
    e.stopPropagation()
    addItem(producto, 1)
    setAgregado(true)
    setTimeout(() => setAgregado(false), 1500)
  }

  return (
    <Link
      to={`/producto/${producto.id}`}
      className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100 flex flex-col group"
    >
      {/* Imagen */}
      <div className="relative overflow-hidden" style={{ height: '168px', background: '#f3f4f6' }}>
        <img
          src={producto.imagen}
          alt={producto.nombre}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { e.target.src = 'https://placehold.co/400x400/1B5232/F9A825?text=DistriMM' }}
        />
        <span
          className="absolute top-2 left-2 text-xs font-bold px-2.5 py-0.5 rounded-full text-white"
          style={{ background: 'var(--green-deep)' }}
        >
          {producto.categoria}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
          {producto.marca}
        </p>
        <h3 className="text-sm font-bold text-gray-800 leading-tight line-clamp-2 mb-2 flex-1 group-hover:underline">
          {producto.nombre}
        </h3>
        <p className="text-base font-black mb-3" style={{ color: 'var(--green-deep)' }}>
          {formatCOP(producto.precio)}
        </p>

        {/* CTA: Agregar al carrito */}
        <button
          onClick={handleAgregar}
          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg text-xs font-bold transition-all"
          style={
            agregado
              ? { background: 'var(--green-deep)', color: '#fff' }
              : { background: 'var(--gold)', color: 'var(--green-dark)' }
          }
        >
          {agregado ? (
            '✓ Agregado'
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              Agregar al carrito
            </>
          )}
        </button>
      </div>
    </Link>
  )
}
