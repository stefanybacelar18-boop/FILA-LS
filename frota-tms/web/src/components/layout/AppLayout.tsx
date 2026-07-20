import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  Building2,
  Route,
  Tags,
  RotateCcw,
  History,
  Users,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Search,
  KeyRound,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../stores/auth'
import { useThemeStore } from '../../stores/theme'
import { roleLabels } from '../../lib/labels'
import type { Role } from '../../types'
import { api } from '../../lib/api'
import { Button, Input, Modal } from '../ui'

interface NavItem {
  to: string
  label: string
  icon: typeof Route
}

const navByRole: Record<Role, { primary: NavItem[]; secondary: NavItem[] }> = {
  ADMIN: {
    primary: [
      { to: '/roteiros', label: 'Roteiros', icon: Route },
      { to: '/retornos', label: 'Retornos', icon: RotateCcw },
    ],
    secondary: [
      { to: '/frota', label: 'Frota', icon: Truck },
      { to: '/concessionarias', label: 'Concessionárias', icon: Building2 },
      { to: '/usuarios', label: 'Usuários', icon: Users },
    ],
  },
  OPERACAO: {
    primary: [
      { to: '/definir-placas', label: 'Pendentes de placa', icon: Tags },
      { to: '/roteiros', label: 'Todos roteiros', icon: Route },
      { to: '/retornos', label: 'Retornos', icon: RotateCcw },
    ],
    secondary: [{ to: '/frota', label: 'Frota', icon: Truck }],
  },
  CONSULTA: {
    primary: [
      { to: '/roteiros', label: 'Roteiros', icon: Route },
      { to: '/frota', label: 'Frota', icon: Truck },
    ],
    secondary: [{ to: '/historico', label: 'Histórico', icon: History }],
  },
}

function NavGroup({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.9375rem] font-medium transition-colors',
              isActive
                ? 'bg-white/10 text-white'
                : 'text-[var(--color-text-sidebar)] hover:bg-white/5 hover:text-white',
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0 opacity-70" />
          {item.label}
        </NavLink>
      ))}
    </div>
  )
}

export function AppLayout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const applyTheme = useThemeStore((s) => s.apply)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [q, setQ] = useState('')
  const [pwdOpen, setPwdOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdOk, setPwdOk] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  useEffect(() => {
    applyTheme()
  }, [applyTheme])

  const groups = useMemo(() => {
    if (!user?.role) return { primary: [], secondary: [] }
    return navByRole[user.role]
  }, [user?.role])

  const homePath =
    user?.role === 'ADMIN' ? '/roteiros' : user?.role === 'OPERACAO' ? '/definir-placas' : '/roteiros'

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (query.length < 2) return
    navigate(`/busca?q=${encodeURIComponent(query)}`)
    setSidebarOpen(false)
  }

  function handleLogout() {
    queryClient.clear()
    logout()
    navigate('/login')
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    setPwdError('')
    setPwdOk('')
    setPwdLoading(true)
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword })
      setPwdOk('Senha alterada com sucesso.')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: unknown) {
      setPwdError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Não foi possível alterar a senha.',
      )
    } finally {
      setPwdLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-56 flex-col bg-[var(--color-bg-sidebar)] text-[var(--color-text-sidebar)] transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Link to={homePath} className="font-display text-lg font-semibold tracking-tight text-white">
            Frota<span className="text-teal-400">TMS</span>
          </Link>
          <button
            type="button"
            className="rounded p-1 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-2.5 pb-4">
          <NavGroup items={groups.primary} onNavigate={() => setSidebarOpen(false)} />
          {groups.secondary.length > 0 && (
            <div>
              <p className="mb-1.5 px-3 text-[0.65rem] font-semibold tracking-wider text-white/30 uppercase">
                Mais
              </p>
              <NavGroup items={groups.secondary} onNavigate={() => setSidebarOpen(false)} />
            </div>
          )}
        </nav>

        <div className="px-4 py-3 text-[0.7rem] text-white/35">
          {user ? roleLabels[user.role] : ''}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 md:px-5">
          <button
            type="button"
            className="rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <form onSubmit={onSearch} className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="h-9 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] pr-3 pl-9 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </form>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
              aria-label="Alternar tema"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenu((v) => !v)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
              >
                <span className="hidden font-medium sm:block">{user?.name}</span>
                <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
              </button>
              {userMenu && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10"
                    aria-label="Fechar menu"
                    onClick={() => setUserMenu(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 w-48 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenu(false)
                        setPwdOpen(true)
                        setPwdError('')
                        setPwdOk('')
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-2)]"
                    >
                      <KeyRound className="h-4 w-4" />
                      Trocar senha
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-surface-2)]"
                    >
                      <LogOut className="h-4 w-4" />
                      Sair
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <Modal open={pwdOpen} onClose={() => setPwdOpen(false)} title="Trocar senha">
        <form onSubmit={onChangePassword} className="space-y-3">
          <Input
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
          {pwdError && <p className="text-sm text-[var(--color-danger)]">{pwdError}</p>}
          {pwdOk && <p className="text-sm text-[var(--color-success)]">{pwdOk}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setPwdOpen(false)}>
              Fechar
            </Button>
            <Button type="submit" loading={pwdLoading}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
