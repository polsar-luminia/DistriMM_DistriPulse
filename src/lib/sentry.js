import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    enabled: import.meta.env.PROD,
    ignoreErrors: [
      "ResizeObserver loop",
      "Network request failed",
      "Load failed",
    ],
  });
}

/**
 * Reporta un error a Sentry con contexto adicional.
 * No-op si Sentry no esta configurado.
 */
export function captureError(error, context = {}) {
  if (!DSN) return;
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });
    Sentry.captureException(error);
  });
}
