import { createBrowserRouter, RouterProvider, Outlet, ScrollRestoration } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Catalogo from './pages/Catalogo'
import Producto from './pages/Producto'
import Checkout from './pages/Checkout'

function Layout() {
  return (
    <CartProvider>
      <ScrollRestoration />
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </CartProvider>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'catalogo', element: <Catalogo /> },
      { path: 'producto/:id', element: <Producto /> },
      { path: 'checkout', element: <Checkout /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
