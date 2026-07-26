export default function CategoryFilter({ categorias, marcas, filtros, onChange }) {
  const toggle = (tipo, valor) => {
    const actual = filtros[tipo] ?? []
    const nuevo = actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor]
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
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Categoría</p>
          <div className="flex flex-col gap-1.5">
            {categorias.map((cat) => (
              <label key={cat} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={filtros.categorias?.includes(cat) ?? false} onChange={() => toggle('categorias', cat)} className="rounded accent-green-800" />
                <span className="text-sm text-gray-700">{cat}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Marca</p>
          <div className="flex flex-col gap-1.5">
            {marcas.map((marca) => (
              <label key={marca} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={filtros.marcas?.includes(marca) ?? false} onChange={() => toggle('marcas', marca)} className="rounded accent-green-800" />
                <span className="text-sm text-gray-700">{marca}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
