import type React from 'react'
import { useState } from 'react'
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
  const [open, setOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [cards, setCards] = useState<RecommendationCard[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!clientId || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ recommendations: RecommendationCard[] }>(
        `/api/clients/${clientId}/recommendations`,
      )
      setCards(res.data.recommendations)
    } catch {
      setError('Tavsiyalar yuklanmadi')
    } finally {
      setLoading(false)
    }
  }

  const chevron = open ? '▼' : '▶'

  const headerBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: 13,
    width: '100%',
    padding: 0,
  }

  const loadBtnDisabled = !clientId || loading || disabled

  const loadBtnStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 'var(--r-md)',
    border: 'none',
    fontSize: 13,
    fontWeight: 600,
    cursor: loadBtnDisabled ? (loading ? 'wait' : 'not-allowed') : 'pointer',
    transition: 'background 150ms ease',
    background: loadBtnDisabled
      ? 'var(--surface-3)'
      : 'var(--sqb-blue-600)',
    color: loadBtnDisabled ? 'var(--text-muted)' : '#fff',
    opacity: loadBtnDisabled && !loading ? 0.6 : 1,
  }

  return (
    <div
      style={{
        marginTop: 16,
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: 12,
      }}
    >
      <button onClick={() => setOpen((o) => !o)} style={headerBtnStyle}>
        <span style={{ fontSize: 10 }}>{chevron}</span>
        <span>Sotuv tavsiyalari</span>
      </button>

      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={load} disabled={loadBtnDisabled} style={loadBtnStyle}>
            {loading ? 'Yuklanmoqda…' : clientId ? '✨ Tavsiya yuklash' : 'Mijozni tanlang'}
          </button>

          {error && (
            <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>
          )}

          {cards.map((c, i) => (
            <div
              key={i}
              style={{
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-2)',
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
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.product}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--success)',
                    fontFamily: 'var(--font-mono)',
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
              {/* Confidence bar */}
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
                    background: 'var(--success)',
                    width: `${c.confidence * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
