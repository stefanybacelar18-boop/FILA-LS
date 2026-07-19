import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { Button, Input } from '../components/ui'

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
        aria-label="Tema"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Frota<span className="text-[var(--color-primary)]">TMS</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Entre para continuar</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" className="w-full" loading={loading} size="lg">
            Entrar
          </Button>
        </form>
      </div>
    </div>
  )
}
