import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

function ErrorFallback({ error, resetErrorBoundary }) {
  const navigate = useNavigate();

  const handleGoHome = () => {
    resetErrorBoundary();
    navigate("/");
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-xl border border-rose-100 p-8 max-w-md w-full text-center">
        <div className="bg-rose-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="text-rose-600" size={32} />
        </div>

        <h2 className="text-xl font-bold text-slate-800 mb-2">
          ¡Ups! Algo salió mal
        </h2>

        <p className="text-slate-500 text-sm mb-4">
          Ha ocurrido un error al cargar esta sección. El resto de la aplicación
          sigue funcionando.
        </p>

        {/* Error details (collapsed by default in production) */}
        {import.meta.env.DEV && (
          <details className="text-left mb-6 bg-slate-50 rounded-lg p-3">
            <summary className="text-xs font-medium text-slate-600 cursor-pointer">
              Detalles técnicos
            </summary>
            <pre className="text-xs text-rose-600 mt-2 overflow-auto max-h-32">
              {error.message}
            </pre>
          </details>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={resetErrorBoundary}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-sm transition-colors"
          >
            <RefreshCw size={16} />
            Reintentar
          </button>
          <button
            onClick={handleGoHome}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors"
          >
            <Home size={16} />
            Ir al Inicio
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ErrorBoundary({ children }) {
  const handleError = (error, errorInfo) => {
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary] Caught error:", error);
      console.error("[ErrorBoundary] Component stack:", errorInfo?.componentStack);
    }

    // TODO: In production, send to error tracking service (e.g., Sentry)
  };

  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={handleError}
      onReset={() => {
        // Optional: Clear any cached state that might have caused the error
        if (import.meta.env.DEV) console.log("[ErrorBoundary] Resetting...");
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
