import type React from 'react'
import { useState, useEffect, useCallback } from 'react'
import api from '../../lib/api'

interface RecommendationCard {
  product: string
  rationale_uz: string
  confidence: number
}

interface SalesRecommendationPanelProps {
  clientId: string | null
  disabled?: boolean
}

export function SalesRecommendationPanel({ clientId, disabled }: SalesRecommendationPanelProps) {
  const [loading, setLoading] = useState(false)
  const [cards, setCards] = useState<RecommendationCard[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ recommendations: RecommendationCard[] }>(
        `/api/clients/${id}/recommendations`,
      )
      setCards(res.data.recommendations ?? [])
    } catch {
      setError('Tavsiyalar yuklanmadi')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-fetch when client changes
  useEffect(() => {
    if (clientId) {
      setCards([])
      load(clientId)
    } else {
      setCards([])
      setError(null)
    }
  }, [clientId, load])

  if (!clientId) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '40px 16px',
          color: 'var(--text-muted)',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 28 }}>👤</span>
        <span>Mijozni tanlang — tavsiyalar avtomatik yuklanadi</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header row with refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>
          Sotuv tavsiyalari
        </span>
        <button
          onClick={() => load(clientId)}
          disabled={loading || disabled}
          title="Yangilash"
          style={{
            background: 'none',
            border: 'none',
            cursor: loading || disabled ? 'not-allowed' : 'pointer',
            color: 'var(--text-muted)',
            fontSize: 13,
            padding: '2px 6px',
            borderRadius: 'var(--r-sm)',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '⏳' : '↻'}
        </button>
      </div>

      {loading && cards.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 72,
                borderRadius: 'var(--r-md)',
                background: 'var(--surface-3)',
                animation: 'pulse 1.4s ease-in-out infinite',
                opacity: 1 - i * 0.15,
              }}
            />
          ))}
        </div>
      )}

      {error && (
        <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>
      )}

      {cards.map((c, i) => (
        <div
          key={i}
          style={{
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-1)',
            padding: '10px 12px',
            fontSize: 13,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.product}</span>
            <span
              style={{
                fontSize: 11,
                color: c.confidence >= 0.7 ? 'var(--success)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
              }}
            >
              {Math.round(c.confidence * 100)}%
            </span>
          </div>
          <p
            style={{
              margin: 0,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              marginBottom: 8,
            }}
          >
            {c.rationale_uz}
          </p>
          <div
            style={{
              height: 3,
              borderRadius: 4,
              background: 'var(--border-subtle)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 4,
                background: c.confidence >= 0.7 ? 'var(--success)' : 'var(--sqb-blue-600)',
                width: `${c.confidence * 100}%`,
                transition: 'width 600ms ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
