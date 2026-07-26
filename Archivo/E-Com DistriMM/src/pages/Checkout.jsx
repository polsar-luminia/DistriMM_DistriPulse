import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatCOP } from '../data/productos'

const INITIAL_FORM = {
  nombre: '',
  apellido: '',
  telefono: '',
  email: '',
  departamento: 'Caquetá',
  ciudad: 'Florencia',
  direccion: '',
  barrio: '',
  notas: '',
}

export default function Checkout() {
  const { items, totalPrecio, totalItems, clearCart } = useCart()
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState({})

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }))
  }

  const validate = () => {
    const errs = {}
    if (!form.nombre.trim()) errs.nombre = 'Requerido'
    if (!form.apellido.trim()) errs.apellido = 'Requerido'
    if (!form.telefono.trim()) errs.telefono = 'Requerido'
    if (!form.direccion.trim()) errs.direccion = 'Requerido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const productLines = items
      .map(({ producto, cantidad }) => `${cantidad}× ${producto.nombre} — ${formatCOP(producto.precio * cantidad)}`)
      .join('\n')

    const msg = [
      '*NUEVO PEDIDO — DistriMM* 🛒',
      '',
      '*Datos del cliente:*',
      `Nombre: ${form.nombre} ${form.apellido}`,
      `Teléfono: ${form.telefono}`,
      `Dirección: ${form.direccion}${form.barrio ? ', ' + form.barrio : ''}`,
      `Ciudad: ${form.ciudad}, ${form.departamento}`,
      form.email ? `Email: ${form.email}` : '',
      '',
      '*Productos:*',
      productLines,
      '',
      `*TOTAL: ${formatCOP(totalPrecio)}*`,
      form.notas ? `\nNotas: ${form.notas}` : '',
    ].filter(Boolean).join('\n')

    const waUrl = `https://wa.me/573134835092?text=${encodeURIComponent(msg)}`
    window.open(waUrl, '_blank')
    clearCart()
    navigate('/')
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--gray-bg)' }}>
        <div className="text-center">
          <p className="text-5xl mb-3">🛒</p>
          <p className="text-gray-500 font-semibold mb-3">Tu carrito está vacío</p>
          <Link to="/catalogo" className="text-sm font-bold hover:underline" style={{ color: 'var(--green-deep)' }}>
            ← Ir al catálogo
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--gray-bg)', minHeight: '100vh' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Checkout</h1>
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
            <span className="font-bold text-green-800">Datos</span>
            <span>→</span>
            <span>Resumen</span>
            <span>→</span>
            <span>Enviar</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="flex-1 order-2 lg:order-1">
            <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-gray-100">
              <h2 className="text-lg font-extrabold text-gray-900 mb-5">Datos de envío</h2>

              {/* Nombre / Apellido */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Field label="Nombre *" value={form.nombre} onChange={set('nombre')} error={errors.nombre} placeholder="Juan" />
                <Field label="Apellido *" value={form.apellido} onChange={set('apellido')} error={errors.apellido} placeholder="Pérez" />
              </div>

              {/* Teléfono */}
              <div className="mb-4">
                <Field label="Teléfono * (+57)" value={form.telefono} onChange={set('telefono')} error={errors.telefono} placeholder="313 4835092" type="tel" />
              </div>

              {/* Email */}
              <div className="mb-4">
                <Field label="Email" value={form.email} onChange={set('email')} placeholder="correo@email.com" type="email" />
              </div>

              {/* Departamento / Ciudad */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Field label="Departamento" value={form.departamento} onChange={set('departamento')} placeholder="Caquetá" />
                <Field label="Ciudad" value={form.ciudad} onChange={set('ciudad')} placeholder="Florencia" />
              </div>

              {/* Dirección */}
              <div className="mb-4">
                <Field label="Dirección completa *" value={form.direccion} onChange={set('direccion')} error={errors.direccion} placeholder="Cra 10 #15-20" />
              </div>

              {/* Barrio */}
              <div className="mb-4">
                <Field label="Barrio" value={form.barrio} onChange={set('barrio')} placeholder="Centro" />
              </div>

              {/* Notas */}
              <div className="mb-6">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Notas / Observaciones</label>
                <textarea
                  value={form.notas}
                  onChange={set('notas')}
                  placeholder="Ej: Entregar por la tarde, preguntar por Don Pedro..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:border-green-700 resize-none"
                  style={{ '--tw-ring-color': 'rgba(27,82,50,0.2)' }}
                />
              </div>

              {/* Total + Submit */}
              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-base font-extrabold text-gray-900">Total a pagar:</span>
                  <span className="text-2xl font-black" style={{ color: 'var(--green-deep)' }}>
                    {formatCOP(totalPrecio)}
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm uppercase tracking-wide text-white transition-opacity hover:opacity-90"
                  style={{ background: '#25D366' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  ENVIAR PEDIDO POR WHATSAPP
                </button>

                <p className="text-xs text-gray-400 text-center mt-3">
                  🔒 Tu información es privada y solo se usa para procesar tu pedido
                </p>
              </div>
            </div>

            <Link
              to="/catalogo"
              className="inline-block mt-4 text-sm font-semibold hover:underline"
              style={{ color: 'var(--green-deep)' }}
            >
              ← Seguir comprando
            </Link>
          </form>

          {/* Resumen del pedido */}
          <div className="lg:w-[380px] order-1 lg:order-2">
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 lg:sticky lg:top-24">
              <h3 className="text-sm font-bold text-gray-900 mb-4">
                Resumen del pedido ({totalItems} {totalItems === 1 ? 'producto' : 'productos'})
              </h3>

              <div className="flex flex-col divide-y divide-gray-50">
                {items.map(({ producto, cantidad }) => (
                  <div key={producto.id} className="flex items-center gap-3 py-3">
                    <img
                      src={producto.imagen}
                      alt={producto.nombre}
                      className="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0"
                      onError={(e) => { e.target.src = 'https://placehold.co/80x80/1B5232/F9A825?text=DM' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{producto.nombre}</p>
                      <p className="text-xs text-gray-400 mt-0.5">×{cantidad}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 shrink-0">
                      {formatCOP(producto.precio * cantidad)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 mt-3 pt-4 flex items-center justify-between">
                <span className="text-sm font-extrabold text-gray-900 uppercase">Total</span>
                <span className="text-xl font-black" style={{ color: 'var(--green-deep)' }}>
                  {formatCOP(totalPrecio)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, error, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full px-4 py-3 rounded-xl border text-sm bg-gray-50 focus:outline-none focus:ring-2 ${
          error ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-green-700'
        }`}
        style={{ '--tw-ring-color': error ? 'rgba(239,68,68,0.2)' : 'rgba(27,82,50,0.2)' }}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}
