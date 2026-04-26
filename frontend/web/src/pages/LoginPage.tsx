import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Card } from '../components/primitives/Card'
import { Input } from '../components/primitives/Input'
import { Button } from '../components/primitives/Button'
import { Logo } from '../components/primitives/Logo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = useAuthStore((s) => s.login)
  const role = useAuthStore((s) => s.role)
  const navigate = useNavigate()

  // Already authenticated: use declarative redirect (no imperative navigate during render)
  if (role === 'supervisor') return <Navigate to="/supervisor" replace />
  if (role === 'agent' || role === 'admin') return <Navigate to="/agent" replace />

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(email, password)
      const currentRole = useAuthStore.getState().role
      if (currentRole === 'supervisor') {
        navigate('/supervisor', { replace: true })
      } else {
        navigate('/agent', { replace: true })
      }
    } catch {
      setError("Login yoki parol noto'g'ri")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `
          radial-gradient(ellipse at 20% 0%, var(--sqb-blue-50) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 100%, var(--ai-glow-soft) 0%, transparent 55%),
          var(--bg-page)
        `,
        padding: 32,
        position: 'relative',
      }}
    >
      {/* Subtle grid backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.4,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          pointerEvents: 'none',
        }}
      />

      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 420,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Card padding={36} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Logo size={48} />
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                Sotuv yordamchisi
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  marginTop: 4,
                  lineHeight: 1.5,
                  maxWidth: 320,
                }}
              >
                Sun'iy intellekt yordamida yangi avlod sotuv yordamchisi
              </div>
            </div>
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label="Elektron pochta"
              icon="mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ism@sqb.uz"
              autoComplete="email"
            />
            <Input
              label="Parol"
              icon="lock"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                fontSize: 13,
                color: 'var(--danger)',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--r-md)',
                padding: '10px 14px',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <Button variant="primary" size="lg" fullWidth type="submit" disabled={loading}>
            {loading ? 'Kirilmoqda…' : 'Kirish'}
          </Button>
        </Card>

        <div
          style={{
            textAlign: 'center',
            marginTop: 20,
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          © 2026 SQB Bank · v0.4.1 MVP
        </div>
      </form>
    </div>
  )
}
