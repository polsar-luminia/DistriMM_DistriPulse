import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { productos, formatCOP } from '../data/productos'
import { useCart } from '../context/CartContext'
import ProductCard from '../components/ProductCard'

export default function Producto() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const [cantidad, setCantidad] = useState(1)
  const [agregado, setAgregado] = useState(false)

  const producto = productos.find((p) => p.id === id)

  if (!producto) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--gray-bg)' }}>
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-gray-500 font-semibold mb-3">Producto no encontrado</p>
          <Link to="/catalogo" className="text-sm font-bold hover:underline" style={{ color: 'var(--green-deep)' }}>
            ← Volver al catálogo
          </Link>
        </div>
      </div>
    )
  }

  const relacionados = productos
    .filter((p) => p.categoria === producto.categoria && p.id !== producto.id)
    .slice(0, 4)

  const handleAgregar = () => {
    addItem(producto, cantidad)
    setAgregado(true)
    setTimeout(() => setAgregado(false), 2000)
  }

  const handleComprarAhora = () => {
    addItem(producto, cantidad)
    navigate('/checkout')
  }

  return (
    <div style={{ background: 'var(--gray-bg)', minHeight: '100vh' }}>

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <nav className="flex items-center gap-2 text-xs text-gray-400">
          <Link to="/" className="hover:text-gray-600">Inicio</Link>
          <span>/</span>
          <Link to="/catalogo" className="hover:text-gray-600">Catálogo</Link>
          <span>/</span>
          <Link to={`/catalogo?categoria=${encodeURIComponent(producto.categoria)}`} className="hover:text-gray-600">
            {producto.categoria}
          </Link>
          <span>/</span>
          <span className="text-gray-600">{producto.nombre}</span>
        </nav>
      </div>

      {/* Producto principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row">

            {/* Imagen */}
            <div className="md:w-[55%] relative bg-gray-50">
              <img
                src={producto.imagen}
                alt={producto.nombre}
                className="w-full h-72 sm:h-96 md:h-full object-cover"
                onError={(e) => { e.target.src = 'https://placehold.co/800x600/1B5232/F9A825?text=DistriMM' }}
              />
              <span
                className="absolute top-4 left-4 text-xs font-bold px-3 py-1 rounded-full text-white"
                style={{ background: 'var(--green-deep)' }}
              >
                {producto.categoria}
              </span>
            </div>

            {/* Info */}
            <div className="md:w-[45%] p-6 sm:p-8 flex flex-col">
              <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-2">
                {producto.marca}
              </p>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight mb-4">
                {producto.nombre}
              </h1>

              <div className="flex items-baseline gap-3 mb-5">
                <span className="text-3xl font-black" style={{ color: 'var(--green-deep)' }}>
                  {formatCOP(producto.precio)}
                </span>
                <span className="text-xs text-gray-400">IVA incluido</span>
              </div>

              {/* Descripción */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Descripción</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{producto.descripcion}</p>
              </div>

              <div className="border-t border-gray-100 pt-5 mt-auto">
                {/* Cantidad */}
                <div className="mb-5">
                  <label className="text-sm font-bold text-gray-700 block mb-2">Cantidad</label>
                  <div className="inline-flex items-center bg-gray-100 rounded-xl">
                    <button
                      onClick={() => setCantidad((q) => Math.max(1, q - 1))}
                      className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-800 text-xl"
                    >
                      −
                    </button>
                    <span className="w-10 text-center font-bold text-gray-900">{cantidad}</span>
                    <button
                      onClick={() => setCantidad((q) => q + 1)}
                      className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-800 text-xl"
                    >
                      +
                    </button>
                  </div>
                  {cantidad > 1 && (
                    <span className="ml-3 text-sm text-gray-400">
                      Total: {formatCOP(producto.precio * cantidad)}
                    </span>
                  )}
                </div>

                {/* Botones */}
                <button
                  onClick={handleAgregar}
                  className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all mb-3"
                  style={
                    agregado
                      ? { background: 'var(--green-deep)', color: '#fff' }
                      : { background: 'var(--gold)', color: 'var(--green-dark)' }
                  }
                >
                  {agregado ? '✓ AGREGADO AL CARRITO' : 'AGREGAR AL CARRITO'}
                </button>

                <button
                  onClick={handleComprarAhora}
                  className="w-full py-3.5 rounded-xl text-sm font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90"
                  style={{ background: '#25D366' }}
                >
                  COMPRAR AHORA
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Productos relacionados */}
      {relacionados.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-12">
          <div className="mb-5">
            <h2 className="text-xl font-extrabold" style={{ color: 'var(--green-deep)' }}>
              Productos Relacionados
            </h2>
            <div className="h-0.5 w-10 mt-1.5 rounded" style={{ background: 'var(--gold)' }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {relacionados.map((p) => (
              <ProductCard key={p.id} producto={p} />
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
