import axios from 'axios'
import { getAccessToken, getRefreshToken, storeTokens, clearTokens, getRole } from './auth'

const api = axios.create({ baseURL: '' })

// Request interceptor: attach Bearer token
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Shared refresh promise — prevents parallel 401s from each firing their own refresh
let refreshPromise: Promise<string> | null = null

function doRedirectLogin() {
  clearTokens()
  // Lazy import to avoid circular dep at module load time
  import('../store/authStore').then(({ useAuthStore }) => {
    useAuthStore.setState({ accessToken: null, role: null })
  })
  window.location.href = '/login'
}

// Response interceptor: on 401, try refresh once; on failure redirect to /login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = getRefreshToken()

      if (refreshToken) {
        try {
          if (!refreshPromise) {
            refreshPromise = axios
              .post('/api/auth/refresh', { refresh_token: refreshToken })
              .then((r) => (r.data as { access_token: string }).access_token)
              .finally(() => {
                refreshPromise = null
              })
          }

          const newAccessToken = await refreshPromise
          storeTokens(newAccessToken, refreshToken, getRole() ?? '')
          // Keep Zustand in sync
          import('../store/authStore').then(({ useAuthStore }) => {
            useAuthStore.setState({ accessToken: newAccessToken })
          })
          originalRequest.headers = originalRequest.headers ?? {}
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
          return api(originalRequest)
        } catch {
          doRedirectLogin()
          return Promise.reject(error)
        }
      } else {
        doRedirectLogin()
      }
    }

    return Promise.reject(error)
  },
)

export default api
