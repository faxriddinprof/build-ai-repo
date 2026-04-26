import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import LoginPage from './pages/LoginPage'
import AgentDashboardPage from './pages/AgentDashboardPage'
import SupervisorPage from './pages/SupervisorPage'
import ProtectedRoute from './components/ProtectedRoute'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
})

export default function App() {
  const init = useAuthStore((s) => s.init)
  const { theme, blueHue, density } = useThemeStore()

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-density', density)
    const h = blueHue
    const s = 88
    root.style.setProperty('--sqb-blue-50', `hsl(${h} ${Math.max(s - 40, 30)}% 96%)`)
    root.style.setProperty('--sqb-blue-100', `hsl(${h} ${Math.max(s - 30, 40)}% 90%)`)
    root.style.setProperty('--sqb-blue-500', `hsl(${h} ${s}% 38%)`)
    root.style.setProperty('--sqb-blue-600', `hsl(${h} ${s}% 30%)`)
    root.style.setProperty('--sqb-blue-700', `hsl(${h} ${Math.min(s + 5, 95)}% 24%)`)
    root.style.setProperty('--ai-glow', `hsl(${h + 10} 95% 60%)`)
    root.style.setProperty('--ai-glow-soft', `hsla(${h + 10}, 95%, 60%, 0.16)`)
    root.style.setProperty('--ai-glow-edge', `hsla(${h + 10}, 95%, 60%, 0.45)`)
  }, [theme, blueHue, density])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* placeholders — will be replaced in Phase 3-5 */}
          <Route
            path="/agent"
            element={
              <ProtectedRoute roles={['agent', 'admin']}>
                <AgentDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor"
            element={
              <ProtectedRoute roles={['supervisor', 'admin']}>
                <SupervisorPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function RootRedirect() {
  const role = useAuthStore((s) => s.role)
  if (role === 'supervisor') return <Navigate to="/supervisor" replace />
  if (role === 'agent' || role === 'admin') return <Navigate to="/agent" replace />
  return <Navigate to="/login" replace />
}
