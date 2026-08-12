/** Ping periódico em produção — mantém o Render Free acordado enquanto alguém usa o app. */
const INTERVAL_MS = 4 * 60 * 1000

export function startRenderKeepAlive(): () => void {
  if (!import.meta.env.PROD) return () => {}

  const ping = () => {
    void fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' }).catch(() => {})
  }

  ping()
  const id = window.setInterval(ping, INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ping()
  })

  return () => window.clearInterval(id)
}
