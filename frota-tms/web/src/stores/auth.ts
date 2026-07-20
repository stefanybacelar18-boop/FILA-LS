import { create } from 'zustand'
import { api, getToken, setToken } from '../lib/api'
import type { Role, User } from '../types'

interface AuthState {
  token: string | null
  user: User | null
  hydrated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  hydrate: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getToken(),
  user: null,
  hydrated: false,

  login: async (email, password) => {
    const { data } = await api.post<{ token: string; user: User }>('/auth/login', {
      email,
      password,
    })
    setToken(data.token)
    set({ token: data.token, user: data.user })
  },

  logout: () => {
    setToken(null)
    set({ token: null, user: null })
  },

  hydrate: async () => {
    const token = getToken()
    if (!token) {
      set({ token: null, user: null, hydrated: true })
      return
    }
    try {
      const { data } = await api.get<User>('/auth/me')
      set({ token, user: data, hydrated: true })
    } catch {
      setToken(null)
      set({ token: null, user: null, hydrated: true })
    }
  },

  hasRole: (...roles) => {
    const role = get().user?.role
    return !!role && roles.includes(role)
  },
}))
