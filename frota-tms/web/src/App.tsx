import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './stores/auth'
import { AppLayout } from './components/layout/AppLayout'
import { RealtimeProvider } from './components/RealtimeProvider'
import { Spinner } from './components/ui'
import type { Role } from './types'

import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Fleet } from './pages/Fleet'
import { FleetDetail } from './pages/FleetDetail'
import { Dealerships } from './pages/Dealerships'
import { Drivers } from './pages/Drivers'
import { Routes as RoutesPage } from './pages/Routes'
import { RouteForm } from './pages/RouteForm'
import { AssignPlates } from './pages/AssignPlates'
import { Trips } from './pages/Trips'
import { Returns } from './pages/Returns'
import { History } from './pages/History'
import { Reports } from './pages/Reports'
import { Users } from './pages/Users'
import { Audit } from './pages/Audit'
import { Search } from './pages/Search'
import { AlertsCenter } from './pages/AlertsCenter'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10_000,
    },
  },
})

function AuthGate({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const hydrated = useAuthStore((s) => s.hydrated)
  const hydrate = useAuthStore((s) => s.hydrate)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!token || !user) return <Navigate to="/login" replace />
  return children
}

function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const hasRole = useAuthStore((s) => s.hasRole)
  if (!hasRole(...roles)) return <Navigate to="/" replace />
  return children
}

function HomeRedirect() {
  const role = useAuthStore((s) => s.user?.role)
  if (role === 'OPERACAO') return <Navigate to="/definir-placas" replace />
  return <Navigate to="/roteiros" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RealtimeProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <AuthGate>
                  <AppLayout />
                </AuthGate>
              }
            >
              <Route index element={<HomeRedirect />} />
              <Route path="mesa" element={<Navigate to="/roteiros" replace />} />
              <Route path="meu-dia" element={<Navigate to="/roteiros" replace />} />
              <Route path="planejamento" element={<Navigate to="/roteiros" replace />} />
              <Route path="alertas" element={<AlertsCenter />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="frota" element={<Fleet />} />
              <Route path="frota/:id" element={<FleetDetail />} />
              <Route path="concessionarias" element={<Dealerships />} />
              <Route path="motoristas" element={<Drivers />} />
              <Route path="roteiros" element={<RoutesPage />} />
              <Route
                path="roteiros/novo"
                element={
                  <RoleGate roles={['ADMIN']}>
                    <RouteForm />
                  </RoleGate>
                }
              />
              <Route
                path="roteiros/:id"
                element={
                  <RoleGate roles={['ADMIN']}>
                    <RouteForm />
                  </RoleGate>
                }
              />
              <Route
                path="definir-placas"
                element={
                  <RoleGate roles={['ADMIN', 'OPERACAO']}>
                    <AssignPlates />
                  </RoleGate>
                }
              />
              <Route path="viagens" element={<Trips />} />
              <Route
                path="retornos"
                element={
                  <RoleGate roles={['ADMIN', 'OPERACAO']}>
                    <Returns />
                  </RoleGate>
                }
              />
              <Route path="historico" element={<History />} />
              <Route path="relatorios" element={<Reports />} />
              <Route
                path="usuarios"
                element={
                  <RoleGate roles={['ADMIN']}>
                    <Users />
                  </RoleGate>
                }
              />
              <Route
                path="auditoria"
                element={
                  <RoleGate roles={['ADMIN']}>
                    <Audit />
                  </RoleGate>
                }
              />
              <Route path="busca" element={<Search />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RealtimeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
