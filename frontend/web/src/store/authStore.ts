import { create } from 'zustand'
import axios from 'axios'
import { storeTokens, getAccessToken, getRole, clearTokens } from '../lib/auth'

interface AuthState {
  accessToken: string | null
  role: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  init: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  role: null,

  login: async (email: string, password: string) => {
    // Use plain axios to avoid the intercepted instance (prevents infinite loops)
    const res = await axios.post('/api/auth/login', { email, password })
    const data = res.data as { access_token: string; refresh_token: string; role: string }
    storeTokens(data.access_token, data.refresh_token, data.role)
    set({ accessToken: data.access_token, role: data.role })
  },

  logout: () => {
    clearTokens()
    set({ accessToken: null, role: null })
  },

  init: () => {
    const accessToken = getAccessToken()
    const role = getRole()
    if (accessToken && role) {
      set({ accessToken, role })
    }
  },
}))
