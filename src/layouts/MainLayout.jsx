/**
 * @fileoverview Main Layout with collapsible sidebar navigation.
 * Sidebar grouped by sections, DistriPulse style.
 * @module layouts/MainLayout
 */

import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Database,
  Clock,
  Menu,
  X,
  Upload,
  LogOut,
  Layers,
  Briefcase,
  Building2,
  Brain,
  ChevronLeft,
  User,
  MessageCircle,
  BotMessageSquare,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ErrorBoundary from "../components/common/ErrorBoundary";
import ConfirmDialog from "../components/ConfirmDialog";
import { useConfirm } from "../hooks/useConfirm";

/* �"?�"?�"? Sidebar link style �"?�"?�"? */
const sidebarLinkClass = (isActive) =>
  `flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150 cursor-pointer ${
    isActive
      ? "bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100"
      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
  }`;

/* �"?�"?�"? Section header �"?�"?�"? */
const SectionLabel = ({ children }) => (
  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] px-3 pt-5 pb-1">
    {children}
  </p>
);

/* �"?�"?�"? Nav sections config �"?�"?�"? */
const navSections = [
  {
    label: "TABLERO",
    links: [{ to: "/", icon: LayoutDashboard, text: "Dashboard", end: true }],
  },
  {
    label: "ANALISIS",
    links: [
      { to: "/clientes", icon: Users, text: "Cartera Clientes" },
      { to: "/directorio", icon: Building2, text: "Directorio" },
      { to: "/vendedores", icon: Briefcase, text: "Vendedores" },
      { to: "/score-crediticio", icon: ShieldCheck, text: "Score Crediticio" },
      { to: "/comisiones", icon: Receipt, text: "Comisiones" },
    ],
  },
  {
    label: "INTELIGENCIA",
    links: [
      { to: "/cfo", icon: Brain, text: "Analisis CFO" },
      { to: "/chatbot", icon: BotMessageSquare, text: "DistriBot" },
    ],
  },
  {
    label: "COMUNICACION",
    links: [{ to: "/mensajes", icon: MessageCircle, text: "Mensajes" }],
  },
  {
    label: "ADMINISTRACION",
    links: [{ to: "/archivos", icon: Database, text: "Archivos" }],
  },
];

/**
 * Main Layout �?" Sidebar + Top header
 */
export default function MainLayout({ dashboardContext }) {
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmProps, confirm] = useConfirm();
  const showExactNumbers = true;

  const handleLogout = async () => {
    const ok = await confirm({
      title: "Cerrar sesion",
      message: "¿Estas seguro que deseas cerrar sesion?",
      confirmText: "Cerrar sesion",
      cancelText: "Cancelar",
      variant: "logout",
    });
    if (ok) {
      await signOut();
      navigate("/login", { replace: true });
    }
  };

  // Close mobile sidebar on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [location.pathname]);

  const {
    availableLoads = [],
    currentLoadId,
    onLoadChange,
    onUploadClick,
    loading: dashboardLoading,
  } = dashboardContext || {};

  /* �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"? Sidebar content (shared desktop/mobile) �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"? */
  const SidebarContent = ({ mobile = false }) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-slate-100 shrink-0">
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <div className="bg-indigo-50 p-1.5 rounded-lg border border-indigo-100">
            <Layers size={18} className="text-indigo-600" />
          </div>
          <span className="font-extrabold text-base tracking-tight text-slate-800">
            Distri<span className="text-indigo-600">MM</span>
          </span>
        </div>
        {/* Collapse toggle (desktop only) */}
        {!mobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Colapsar menu lateral"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        {mobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Cerrar menu lateral"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {navSections.map((section) => (
          <div key={section.label}>
            <SectionLabel>{section.label}</SectionLabel>
            <div className="flex flex-col gap-0.5">
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => sidebarLinkClass(isActive)}
                >
                  <link.icon size={16} />
                  <span>{link.text}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer version */}
      <div className="px-4 py-3 border-t border-slate-100 shrink-0">
        <p className="text-[10px] text-slate-400 font-medium text-center">
          V1.0.0 ·{" "}
          <a
            href="https://hola.luminiatech.digital"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent hover:opacity-90"
          >
            LuminIA
          </a>
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-800 flex overflow-x-hidden">
      {/* �"?�"?�"? Desktop Sidebar �"?�"?�"? */}
      <aside
        className={`hidden md:flex flex-col bg-white border-r border-slate-200 shrink-0 transition-all duration-200 fixed top-0 left-0 h-screen z-30 ${
          sidebarOpen ? "w-56" : "w-0 overflow-hidden"
        }`}
      >
        <SidebarContent />
      </aside>
      {/* Sidebar spacer to push content right */}
      {sidebarOpen && <div className="hidden md:block w-56 shrink-0" />}

      {/* �"?�"?�"? Mobile Sidebar Overlay �"?�"?�"? */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-64 bg-white z-50 shadow-2xl md:hidden animate-in slide-in-from-left duration-200">
            <SidebarContent mobile />
          </aside>
        </>
      )}

      {/* �"?�"?�"? Right side (header + content) �"?�"?�"? */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-14 flex items-center px-3 sm:px-5 gap-3 shrink-0">
          {/* Mobile hamburger �?" always visible on mobile */}
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0 md:hidden"
            aria-label="Abrir menu de navegacion"
          >
            <Menu size={18} />
          </button>

          {/* Desktop hamburger �?" only when sidebar is collapsed */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0 hidden md:flex"
              aria-label="Abrir menu lateral"
            >
              <Menu size={18} />
            </button>
          )}

          {/* Brand (collapsed sidebar fallback) */}
          {!sidebarOpen && (
            <div
              className="hidden md:flex items-center gap-2 cursor-pointer"
              onClick={() => navigate("/")}
            >
              <div className="bg-indigo-50 p-1 rounded-md border border-indigo-100">
                <Layers size={14} className="text-indigo-600" />
              </div>
              <span className="font-extrabold text-sm tracking-tight text-slate-800">
                Distri<span className="text-indigo-600">MM</span>
              </span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Time Travel Selector */}
            {availableLoads.length > 0 ? (
              <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2.5 py-1.5 border border-slate-200">
                <Clock size={14} className="text-indigo-600 shrink-0" />
                <select
                  value={currentLoadId || ""}
                  onChange={(e) => onLoadChange?.(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700 min-w-[100px]"
                >
                  {availableLoads.map((load) => (
                    <option key={load.id} value={load.id}>
                      Corte: {load.fecha_corte}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                Sin histórico
              </span>
            )}

            {/* Upload button */}
            <button
              onClick={onUploadClick}
              className="px-3 py-1.5 bg-indigo-600 rounded-lg text-xs font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">Cargar</span>
            </button>

            {/* User / Logout */}
            <div className="ml-1 pl-2 border-l border-slate-200 flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-slate-500">
                <User size={16} />
                <span className="text-xs font-medium hidden lg:inline">
                  Usuario
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                title="Cerrar Sesión"
                aria-label="Cerrar sesion"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 space-y-8 w-full relative">
          {dashboardLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Cargando datos...
                </span>
              </div>
            </div>
          )}
          <ErrorBoundary>
            <Outlet context={{ showExactNumbers, ...dashboardContext }} />
          </ErrorBoundary>
        </main>

        {/* Compact footer */}
        <footer className="py-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            &copy; {new Date().getFullYear()} DistriPulse Analytics Diseñado
            para DistriMM · Powered by{" "}
            <a
              href="https://hola.luminiatech.digital"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent hover:opacity-90"
            >
              LuminIA
            </a>
          </p>
        </footer>
      </div>

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
