import type React from 'react'
import { useState, useCallback } from 'react'
import { Card } from '../primitives/Card'
import { LiveDot } from '../primitives/LiveDot'
import { Icon } from '../Icon'

export interface SuggestionCardProps {
  variant?: 'empty' | 'settled'
  trigger?: string
  bullets?: string[]
  age?: number
  onCopy?: (text: string) => void
}

export function SuggestionCard({ variant = 'empty', trigger, bullets, age, onCopy }: SuggestionCardProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const isFresh = (age ?? 0) < 2

  const handleCopy = useCallback(
    (text: string, idx: number) => {
      void navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1500)
      onCopy?.(text)
    },
    [onCopy],
  )

  if (variant === 'empty') {
    return (
      <div
        style={{
          border: '2px dashed var(--border-subtle)',
          borderRadius: 'var(--r-lg)',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          color: 'var(--text-muted)',
        }}
      >
        {/* Equalizer bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }}>
          {[0.5, 0.8, 1.0, 0.7, 0.4].map((h, i) => (
            <span
              key={i}
              style={{
                display: 'block',
                width: 4,
                height: 28 * h,
                background: 'var(--ai-glow)',
                borderRadius: 2,
                opacity: 0.5,
                transformOrigin: 'bottom',
                animation: `equalizer ${0.8 + i * 0.15}s ease-in-out ${i * 0.1}s infinite`,
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 13 }}>AI tinglamoqda…</span>
      </div>
    )
  }

  // settled variant
  const animStyle: React.CSSProperties = isFresh
    ? { animation: 'slide-in-top 320ms var(--ease-spring) both, ai-glow-fade 2.4s ease-out forwards' }
    : {}

  return (
    <Card variant={isFresh ? 'glass' : 'default'} padding={16} style={animStyle}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <LiveDot size={7} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ai-glow)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          AI Tavsiya
        </span>
        {trigger && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '2px 8px',
              background: 'var(--surface-3)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--r-full)',
              border: '1px solid var(--border-subtle)',
              marginLeft: 'auto',
              maxWidth: 180,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            "{trigger}"
          </span>
        )}
      </div>

      {/* Bullets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(bullets ?? []).map((bullet, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '8px 10px',
              background: 'var(--surface-2)',
              borderRadius: 'var(--r-md)',
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'var(--sqb-blue-600)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {idx + 1}
            </span>
            <span style={{ flex: 1, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
              {bullet}
            </span>
            <button
              onClick={() => handleCopy(bullet, idx)}
              title="Nusxa olish"
              style={{
                flexShrink: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: copiedIdx === idx ? 'var(--success)' : 'var(--text-muted)',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Icon name={copiedIdx === idx ? 'check' : 'copy'} size={14} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}
