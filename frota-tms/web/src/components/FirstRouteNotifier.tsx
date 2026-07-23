import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { connectSocket } from '../lib/socket'
import { useAuthStore } from '../stores/auth'
import { Button } from './ui'

type FirstRoutePayload = {
  routeId: string
  routeName: string
  routeDate: string
  createdByName: string
}

const PERMISSION_ASKED_KEY = 'frotatms-notify-asked'

function ensureBrowserPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'default') return
  if (sessionStorage.getItem(PERMISSION_ASKED_KEY)) return
  sessionStorage.setItem(PERMISSION_ASKED_KEY, '1')
  void Notification.requestPermission()
}

function showBrowserNotification(payload: FirstRoutePayload) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification('FrotaTMS — primeiro roteiro do dia', {
      body: `${payload.routeName} · ${payload.routeDate}`,
      tag: `first-route-${payload.routeId}`,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // ignore
  }
}

/** Banner in-app + notificação do navegador quando o 1º roteiro do dia é disponibilizado. */
export function FirstRouteNotifier() {
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.user?.role)
  const [payload, setPayload] = useState<FirstRoutePayload | null>(null)

  useEffect(() => {
    if (!token) return
    if (role !== 'ADMIN' && role !== 'OPERACAO') return

    ensureBrowserPermission()
    const socket = connectSocket()

    const onNotify = (data: FirstRoutePayload) => {
      if (!data?.routeId || !data?.routeName) return
      setPayload(data)
      showBrowserNotification(data)
    }

    socket.on('notify:first-route', onNotify)
    return () => {
      socket.off('notify:first-route', onNotify)
    }
  }, [token, role])

  if (!payload) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[min(100%-2rem,22rem)] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-muted)] text-[var(--color-primary)]">
          <Bell className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)]">Primeiro roteiro do dia</p>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
            <strong className="text-[var(--color-text)]">{payload.routeName}</strong>
            {' · '}
            {payload.routeDate}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/definir-placas?routeId=${payload.routeId}`} onClick={() => setPayload(null)}>
              <Button size="sm">Definir placa</Button>
            </Link>
            <Button size="sm" variant="secondary" onClick={() => setPayload(null)}>
              Fechar
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => setPayload(null)}
          className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
