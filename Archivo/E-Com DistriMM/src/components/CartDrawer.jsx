import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatCOP } from '../data/productos'

export default function CartDrawer({ open, onClose }) {
  const { items, removeItem, updateQuantity, totalItems, totalPrecio } = useCart()

  useEffect(() => {
    if (!open) return
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-extrabold text-gray-900">
            Tu carrito ({totalItems})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🛒</p>
              <p className="text-gray-400 font-semibold text-sm">Tu carrito está vacío</p>
              <button
                onClick={onClose}
                className="mt-4 text-sm font-bold hover:underline"
                style={{ color: 'var(--green-deep)' }}
              >
                Seguir comprando →
              </button>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-gray-50">
              {items.map(({ producto, cantidad }) => (
                <div key={producto.id} className="flex gap-4 py-4">
                  <Link
                    to={`/producto/${producto.id}`}
                    onClick={onClose}
                    className="shrink-0"
                  >
                    <img
                      src={producto.imagen}
                      alt={producto.nombre}
                      className="w-[72px] h-[72px] object-cover rounded-lg bg-gray-100"
                      onError={(e) => { e.target.src = 'https://placehold.co/120x120/1B5232/F9A825?text=DM' }}
                    />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/producto/${producto.id}`}
                      onClick={onClose}
                      className="text-sm font-bold text-gray-800 leading-tight line-clamp-2 hover:underline block"
                    >
                      {producto.nombre}
                    </Link>
                    <p className="text-sm font-extrabold mt-1" style={{ color: 'var(--green-deep)' }}>
                      {formatCOP(producto.precio * cantidad)}
                      {cantidad > 1 && (
                        <span className="text-xs text-gray-400 font-normal ml-1">
                          ({formatCOP(producto.precio)} c/u)
                        </span>
                      )}
                    </p>

                    <div className="flex items-center justify-between mt-2">
                      {/* Quantity */}
                      <div className="flex items-center bg-gray-100 rounded-lg">
                        <button
                          onClick={() => updateQuantity(producto.id, cantidad - 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 text-lg"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-bold">{cantidad}</span>
                        <button
                          onClick={() => updateQuantity(producto.id, cantidad + 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 text-lg"
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={() => removeItem(producto.id)}
                        className="text-xs font-semibold text-red-400 hover:text-red-600 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-4 bg-white">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-500">Subtotal</span>
              <span className="text-xl font-black text-gray-900">{formatCOP(totalPrecio)}</span>
            </div>
            <Link
              to="/checkout"
              onClick={onClose}
              className="flex items-center justify-center w-full py-3.5 rounded-xl font-bold text-sm text-white transition-opacity hover:opacity-90 mb-2"
              style={{ background: '#25D366' }}
            >
              IR AL CHECKOUT
            </Link>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
            >
              Seguir comprando
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in { animation: slideIn 0.25s ease-out; }
      `}</style>
    </div>
  )
}
