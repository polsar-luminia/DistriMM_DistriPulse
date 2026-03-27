import React from "react";
import { ErrorBoundary } from "react-error-boundary";
import PropTypes from "prop-types";
import { captureError } from "../lib/sentry";

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-app-bg p-4 text-center">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-xl max-w-lg w-full border border-slate-200 dark:border-slate-700">
        <h2 className="text-2xl font-bold text-red-600 mb-4">
          ¡Algo salió mal!
        </h2>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Ha ocurrido un error inesperado. Por favor, intenta recargar la
          página.
        </p>
        {import.meta.env.DEV && (
          <pre className="bg-slate-100 dark:bg-slate-900 p-4 rounded text-xs text-left overflow-auto mb-6 max-h-40 border border-slate-200 dark:border-slate-700">
            <code className="text-red-500">{error.message}</code>
          </pre>
        )}
        <button
          onClick={resetErrorBoundary}
          className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors font-medium cursor-pointer"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}

ErrorFallback.propTypes = {
  error: PropTypes.object.isRequired,
  resetErrorBoundary: PropTypes.func.isRequired,
};

export const GlobalErrorBoundary = ({ children }) => {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        captureError(error, {
          componentStack: errorInfo?.componentStack,
          boundary: "global",
        });
      }}
      onReset={() => {
        // Reset the state of your app so the error doesn't happen again
        window.location.reload();
      }}
    >
      {children}
    </ErrorBoundary>
  );
};

GlobalErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};
