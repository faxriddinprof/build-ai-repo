const ACCESS_KEY = 'sqb_access'
const REFRESH_KEY = 'sqb_refresh'
const ROLE_KEY = 'sqb_role'

export function storeTokens(access: string, refresh: string, role: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
  localStorage.setItem(ROLE_KEY, role)
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function getRole(): string | null {
  return localStorage.getItem(ROLE_KEY)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(ROLE_KEY)
}
