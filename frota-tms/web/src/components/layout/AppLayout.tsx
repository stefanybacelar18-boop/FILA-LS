import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
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
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../stores/auth'
import { useThemeStore } from '../../stores/theme'
import { roleLabels } from '../../lib/labels'
import type { Role } from '../../types'
interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles?: Role[]
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/frota', label: 'Frota', icon: Truck },
  { to: '/concessionarias', label: 'Concessionárias', icon: Building2 },
  { to: '/roteiros', label: 'Roteiros', icon: Route },
  { to: '/definir-placas', label: 'Definir Placas', icon: Tags, roles: ['ADMIN', 'OPERACAO'] },
  { to: '/viagens', label: 'Viagens', icon: MapPinned },
  { to: '/retornos', label: 'Retornos', icon: RotateCcw, roles: ['ADMIN', 'OPERACAO'] },
  { to: '/historico', label: 'Histórico', icon: History },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart },
  { to: '/usuarios', label: 'Usuários', icon: Users, roles: ['ADMIN'] },
  { to: '/auditoria', label: 'Auditoria', icon: Shield, roles: ['ADMIN'] },
]

export function AppLayout() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const applyTheme = useThemeStore((s) => s.apply)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    applyTheme()
  }, [applyTheme])

  const items = useMemo(
    () =>
      navItems.filter((item) => {
        if (!item.roles) return true
        return user?.role && item.roles.includes(user.role)
      }),
    [user?.role],
  )

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (query.length < 2) return
    navigate(`/busca?q=${encodeURIComponent(query)}`)
    setSidebarOpen(false)
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

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
          <Link to="/" className="font-display text-lg font-bold tracking-tight text-white">
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

        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-teal-600/90 text-white'
                    : 'hover:bg-[var(--color-bg-sidebar-hover)] hover:text-white',
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0 opacity-80" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3 text-xs text-slate-400">
          Sistema de roteirização de frota
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
              placeholder="Buscar placa, roteiro, concessionária…"
              className="h-9 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] pr-3 pl-9 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                  <div className="absolute right-0 z-20 mt-1 w-48 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]">
                    <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] sm:hidden">
                      {user?.name}
                      <br />
                      {user ? roleLabels[user.role] : ''}
                    </div>
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
    </div>
  )
}
