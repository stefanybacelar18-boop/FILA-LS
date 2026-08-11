import * as Sentry from '@sentry/node';

let enabled = false;

/** Ativa Sentry só quando SENTRY_DSN estiver configurado (sem impacto em dev local). */
export function initApiMonitoring(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05'),
  });
  enabled = true;
}

export function captureApiException(error: unknown): void {
  if (!enabled) return;
  Sentry.captureException(error);
}
