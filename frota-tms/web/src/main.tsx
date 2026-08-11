import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useThemeStore } from './stores/theme'
import { initWebMonitoring, Sentry } from './lib/monitoring'

initWebMonitoring()
useThemeStore.getState().apply()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p className="p-6 text-center text-sm text-red-600">Algo deu errado. Recarregue a página.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
