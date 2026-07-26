import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { productos, CATEGORIAS } from '../data/productos'
import ProductCard from '../components/ProductCard'

const CAT_ICONS = {
  'Agrosemillas': '🌱',
  'Vacunas': '💉',
  'Drogas': '💊',
  'Concentrados': '🌾',
  'Sales Minerales': '🧂',
}

export default function Catalogo() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [busqueda, setBusqueda] = useState(() => searchParams.get('q') ?? '')
  const [marcasFiltro, setMarcasFiltro] = useState([])
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)

  const categoriaURL = searchParams.get('categoria')
  const categoriasFiltro = categoriaURL ? [categoriaURL] : []

  const toggleCategoria = (cat) => {
    const params = new URLSearchParams()
    if (cat && cat !== categoriaURL) params.set('categoria', cat)
    setSearchParams(params)
    setMarcasFiltro([])
  }

  const marcasDisponibles = [...new Set(productos.map((p) => p.marca))].sort()

  const toggleMarca = (marca) => {
    setMarcasFiltro((prev) =>
      prev.includes(marca) ? prev.filter((m) => m !== marca) : [...prev, marca]
    )
  }

  const limpiarFiltros = () => {
    setBusqueda('')
    setMarcasFiltro([])
    setSearchParams(new URLSearchParams())
  }

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const matchBusqueda =
        busqueda === '' ||
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.marca.toLowerCase().includes(busqueda.toLowerCase())
      const matchCat = categoriasFiltro.length === 0 || categoriasFiltro.includes(p.categoria)
      const matchMarca = marcasFiltro.length === 0 || marcasFiltro.includes(p.marca)
      return matchBusqueda && matchCat && matchMarca
    })
  }, [busqueda, categoriasFiltro, marcasFiltro])

  const hayFiltros = categoriaURL || marcasFiltro.length > 0 || busqueda

  return (
    <div style={{ background: 'var(--gray-bg)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: 'var(--green-deep)' }} className="py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mb-1">
            Catálogo de Productos
          </h1>
          <p className="text-white/60 text-sm">{productosFiltrados.length} productos encontrados</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Buscador */}
        <div className="mb-4">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar por nombre o marca..."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:border-green-700"
            style={{ '--tw-ring-color': 'rgba(27,82,50,0.2)' }}
          />
        </div>

        {/* Pills de categorías */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => toggleCategoria(null)}
            className="px-4 py-2 rounded-full text-sm font-bold transition-all"
            style={
              !categoriaURL
                ? { background: 'var(--green-deep)', color: '#fff' }
                : { background: '#fff', color: '#374151', border: '1px solid #e5e7eb' }
            }
          >
            Todos
          </button>
          {CATEGORIAS.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategoria(cat)}
              className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
              style={
                categoriaURL === cat
                  ? { background: 'var(--green-deep)', color: '#fff' }
                  : { background: '#fff', color: '#374151', border: '1px solid #e5e7eb' }
              }
            >
              {CAT_ICONS[cat]} {cat}
            </button>
          ))}
        </div>

        {/* Filtro marcas — colapsable en mobile */}
        <div className="mb-5">
          <button
            onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
            className="flex items-center gap-2 text-sm font-semibold mb-2"
            style={{ color: 'var(--green-deep)' }}
          >
            <span>{filtrosAbiertos ? '▲' : '▼'}</span>
            Filtrar por marca
            {marcasFiltro.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs text-white font-bold" style={{ background: 'var(--green-deep)' }}>
                {marcasFiltro.length}
              </span>
            )}
          </button>

          {filtrosAbiertos && (
            <div className="flex flex-wrap gap-2 p-3 bg-white rounded-xl border border-gray-100">
              {marcasDisponibles.map((marca) => (
                <button
                  key={marca}
                  onClick={() => toggleMarca(marca)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={
                    marcasFiltro.includes(marca)
                      ? { background: 'var(--gold)', color: 'var(--green-dark)' }
                      : { background: '#f3f4f6', color: '#374151' }
                  }
                >
                  {marca}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Limpiar filtros */}
        {hayFiltros && (
          <div className="mb-4">
            <button
              onClick={limpiarFiltros}
              className="text-sm font-semibold hover:underline"
              style={{ color: 'var(--green-deep)' }}
            >
              ✕ Limpiar filtros
            </button>
          </div>
        )}

        {/* Grid de productos */}
        {productosFiltrados.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {productosFiltrados.map((p) => (
              <ProductCard key={p.id} producto={p} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-gray-500 font-semibold">No encontramos productos con ese filtro</p>
            <button
              onClick={limpiarFiltros}
              className="mt-3 text-sm font-bold hover:underline"
              style={{ color: 'var(--green-deep)' }}
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
