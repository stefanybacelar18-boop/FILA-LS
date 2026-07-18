import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  Building2,
  Route,
  Tags,
  MapPinned,
  RotateCcw,
  History,
  FileBarChart,
  Users,
  Shield,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Search,
  KeyRound,
  LayoutGrid,
  CalendarDays,
  Bell,
  ClipboardList,
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
  icon: typeof LayoutGrid
  roles?: Role[]
}

/** Menus enxutos por papel — fluxo linear, poucos cliques */
const navByRole: Record<Role, NavItem[]> = {
  ADMIN: [
    { to: '/mesa', label: 'Mesa', icon: LayoutGrid },
    { to: '/meu-dia', label: 'Meu Dia', icon: CalendarDays },
    { to: '/planejamento', label: 'Planejamento', icon: ClipboardList },
    { to: '/alertas', label: 'Alertas', icon: Bell },
    { to: '/roteiros', label: 'Roteiros', icon: Route },
    { to: '/frota', label: 'Frota', icon: Truck },
    { to: '/concessionarias', label: 'Concessionárias', icon: Building2 },
    { to: '/retornos', label: 'Retornos', icon: RotateCcw },
    { to: '/relatorios', label: 'Relatórios', icon: FileBarChart },
    { to: '/usuarios', label: 'Usuários', icon: Users },
    { to: '/auditoria', label: 'Auditoria', icon: Shield },
  ],
  OPERACAO: [
    { to: '/definir-placas', label: 'Definir Placas', icon: Tags },
    { to: '/alertas', label: 'Alertas', icon: Bell },
    { to: '/retornos', label: 'Retornos', icon: RotateCcw },
    { to: '/viagens', label: 'Viagens', icon: MapPinned },
    { to: '/frota', label: 'Frota', icon: Truck },
  ],
  CONSULTA: [
    { to: '/planejamento', label: 'Planejamento', icon: ClipboardList },
    { to: '/alertas', label: 'Alertas', icon: Bell },
    { to: '/roteiros', label: 'Roteiros', icon: Route },
    { to: '/frota', label: 'Frota', icon: Truck },
    { to: '/viagens', label: 'Viagens', icon: MapPinned },
    { to: '/historico', label: 'Histórico', icon: History },
    { to: '/relatorios', label: 'Relatórios', icon: FileBarChart },
  ],
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

  const items = useMemo(() => {
    if (!user?.role) return []
    return navByRole[user.role] ?? []
  }, [user?.role])

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

  const homePath =
    user?.role === 'ADMIN' ? '/mesa' : user?.role === 'OPERACAO' ? '/definir-placas' : '/planejamento'

  return (
    <div className="flex min-h-screen">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[var(--color-bg-sidebar)] text-[var(--color-text-sidebar)] transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
          <Link to={homePath} className="font-display text-xl font-bold tracking-tight text-white">
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

        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to === homePath}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-3 text-base font-semibold transition-colors',
                  isActive
                    ? 'bg-teal-600/90 text-white'
                    : 'hover:bg-[var(--color-bg-sidebar-hover)] hover:text-white',
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0 opacity-90" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3 text-xs text-slate-400">
          {user ? roleLabels[user.role] : ''} · operação logística
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/90 px-3 backdrop-blur md:px-5">
          <button
            type="button"
            className="rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <form onSubmit={onSearch} className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar placa, roteiro, cidade…"
              className="h-10 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] pr-3 pl-9 text-base outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
              aria-label="Alternar tema"
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenu((v) => !v)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
              >
                <span className="hidden text-right sm:block">
                  <span className="block font-medium leading-tight">{user?.name}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {user ? roleLabels[user.role] : ''}
                  </span>
                </span>
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
                  <div className="absolute right-0 z-20 mt-1 w-52 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]">
                    <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] sm:hidden">
                      {user?.name}
                      <br />
                      {user ? roleLabels[user.role] : ''}
                    </div>
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

        <main className="flex-1 p-3 md:p-5">
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
          {pwdError && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {pwdError}
            </p>
          )}
          {pwdOk && (
            <p className="rounded border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-800 dark:text-teal-200">
              {pwdOk}
            </p>
          )}
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
