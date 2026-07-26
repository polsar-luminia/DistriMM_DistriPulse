import { createContext, useContext, useReducer, useEffect } from 'react'

const CartContext = createContext(null)

const STORAGE_KEY = 'distrimm-cart'

function loadCart() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveCart(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function cartReducer(items, action) {
  let next
  switch (action.type) {
    case 'ADD': {
      const idx = items.findIndex((i) => i.producto.id === action.producto.id)
      if (idx >= 0) {
        next = items.map((item, i) =>
          i === idx ? { ...item, cantidad: item.cantidad + action.cantidad } : item
        )
      } else {
        next = [...items, { producto: action.producto, cantidad: action.cantidad }]
      }
      break
    }
    case 'REMOVE':
      next = items.filter((i) => i.producto.id !== action.id)
      break
    case 'UPDATE_QTY':
      if (action.cantidad <= 0) {
        next = items.filter((i) => i.producto.id !== action.id)
      } else {
        next = items.map((i) =>
          i.producto.id === action.id ? { ...i, cantidad: action.cantidad } : i
        )
      }
      break
    case 'CLEAR':
      next = []
      break
    default:
      return items
  }
  saveCart(next)
  return next
}

export function CartProvider({ children }) {
  const [items, dispatch] = useReducer(cartReducer, null, loadCart)

  useEffect(() => {
    saveCart(items)
  }, [items])

  const addItem = (producto, cantidad = 1) =>
    dispatch({ type: 'ADD', producto, cantidad })

  const removeItem = (id) =>
    dispatch({ type: 'REMOVE', id })

  const updateQuantity = (id, cantidad) =>
    dispatch({ type: 'UPDATE_QTY', id, cantidad })

  const clearCart = () =>
    dispatch({ type: 'CLEAR' })

  const totalItems = items.reduce((sum, i) => sum + i.cantidad, 0)
  const totalPrecio = items.reduce((sum, i) => sum + i.producto.precio * i.cantidad, 0)

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrecio }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart debe usarse dentro de CartProvider')
  return ctx
}
