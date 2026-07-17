import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Truck } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { Button, Input } from '../components/ui'
import { useThemeStore } from '../stores/theme'
import { Moon, Sun } from 'lucide-react'

export function Login() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const login = useAuthStore((s) => s.login)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (token && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Credenciais inválidas. Verifique e-mail e senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-teal-600/20 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-slate-500/15 blur-3xl" />
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
        aria-label="Tema"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white shadow-[var(--shadow-md)]">
            <Truck className="h-7 w-7" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Frota<span className="text-[var(--color-primary)]">TMS</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Sistema de roteirização e gestão de frota
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]"
        >
          <div className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Senha"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" loading={loading} size="lg">
              Entrar
            </Button>
          </div>
          {import.meta.env.DEV && (
            <p className="mt-4 text-center text-xs text-[var(--color-text-muted)]">
              Dev: admin@frotatms.com / admin123
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
