import * as Sentry from '@sentry/react';

/** Ativa Sentry no browser só quando VITE_SENTRY_DSN estiver no build. */
export function initWebMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0.05'),
  });
}

export { Sentry };
