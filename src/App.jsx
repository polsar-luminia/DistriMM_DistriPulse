/**
 * @fileoverview Application Root.
 * Uses the original DashboardManager which contains all business logic.
 * @module App
 */

import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardManager from "./components/DashboardManager";
import DashboardPage from "./pages/DashboardPage";
import ClientsPage from "./pages/ClientsPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster } from "sileo";
import "sileo/styles.css";
import LoginPage from "./pages/LoginPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import DataDeletionPage from "./pages/DataDeletionPage";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";

// Lazy imports for heavy pages
const FilesPage = lazy(() => import("./pages/FilesPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const CfoAnalysisPage = lazy(() => import("./pages/CfoAnalysisPage"));
const ChatbotPage = lazy(() => import("./pages/ChatbotPage"));
const ComisionesPage = lazy(() => import("./pages/ComisionesPage"));
const DirectorioClientesPage = lazy(
  () => import("./pages/DirectorioClientesPage"),
);
const VendedoresPage = lazy(() => import("./pages/VendedoresPage"));
const ScoreCrediticioPage = lazy(() => import("./pages/ScoreCrediticioPage"));

const LazyFallback = (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

// Componente interno para manejar el enrutamiento condicional y proteccion
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return null;

  return user ? children : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <GlobalErrorBoundary>
      <AuthProvider>
        <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-slate-50">
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/data-deletion" element={<DataDeletionPage />} />

              {/* Dashboard Modular System */}
              <Route
                path="/*"
                element={
                  <PrivateRoute>
                    <DashboardManager />
                  </PrivateRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="clientes" element={<ClientsPage />} />
                <Route
                  path="directorio"
                  element={
                    <Suspense fallback={LazyFallback}>
                      <DirectorioClientesPage />
                    </Suspense>
                  }
                />
                <Route
                  path="vendedores"
                  element={
                    <Suspense fallback={LazyFallback}>
                      <VendedoresPage />
                    </Suspense>
                  }
                />
                <Route
                  path="archivos"
                  element={
                    <Suspense fallback={LazyFallback}>
                      <FilesPage />
                    </Suspense>
                  }
                />
                <Route
                  path="mensajes"
                  element={
                    <Suspense fallback={LazyFallback}>
                      <MessagesPage />
                    </Suspense>
                  }
                />
                <Route
                  path="cfo"
                  element={
                    <Suspense fallback={LazyFallback}>
                      <CfoAnalysisPage />
                    </Suspense>
                  }
                />
                <Route
                  path="chatbot"
                  element={
                    <Suspense fallback={LazyFallback}>
                      <ChatbotPage />
                    </Suspense>
                  }
                />
                <Route
                  path="score-crediticio"
                  element={
                    <Suspense fallback={LazyFallback}>
                      <ScoreCrediticioPage />
                    </Suspense>
                  }
                />
                <Route
                  path="comisiones"
                  element={
                    <Suspense fallback={LazyFallback}>
                      <ComisionesPage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster position="top-center" />
        </div>
      </AuthProvider>
    </GlobalErrorBoundary>
  );
}
