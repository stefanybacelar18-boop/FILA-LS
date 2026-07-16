import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
  apply: () => void
}

function applyDom(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggle: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        applyDom(next)
        set({ theme: next })
      },
      setTheme: (theme) => {
        applyDom(theme)
        set({ theme })
      },
      apply: () => applyDom(get().theme),
    }),
    {
      name: 'frotatms-theme',
      onRehydrateStorage: () => (state) => {
        state?.apply()
      },
    },
  ),
)
