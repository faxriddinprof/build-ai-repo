import type React from 'react'
import { useCallback, useRef, useState } from 'react'
import type { AIAnswerEntry } from '../../types/session'

interface AITavsiyalarPanelProps {
  aiAnswers: AIAnswerEntry[]
  isListening: boolean
}

export function AITavsiyalarPanel({ aiAnswers, isListening }: AITavsiyalarPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    if (timerRef.current) clearTimeout(timerRef.current)
    setCopiedId(id)
    timerRef.current = setTimeout(() => setCopiedId(null), 1500)
  }, [])

  // Show last 5 completed answers, newest first
  const completed = [...aiAnswers].filter((a) => !a.streaming).reverse().slice(0, 5)
  const streaming = aiAnswers.find((a) => a.streaming)

  if (!isListening && aiAnswers.length === 0) {
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
        <span style={{ fontSize: 28, opacity: 0.5 }}>🎙</span>
        <span>Suhbatni boshlang — AI tavsiyalar paydo bo'ladi</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Listening indicator */}
      {isListening && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 'var(--r-md)',
            background: 'color-mix(in srgb, var(--ai-glow) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--ai-glow) 25%, transparent)',
            fontSize: 12,
            color: 'var(--ai-glow)',
            fontWeight: 600,
          }}
        >
          <PulsingDot />
          AI tinglamoqda…
        </div>
      )}

      {/* Streaming answer skeleton */}
      {streaming && (
        <AnswerCard
          id={streaming.id}
          text={streaming.text}
          streaming
          copiedId={copiedId}
          onCopy={handleCopy}
        />
      )}

      {/* Completed answers */}
      {completed.map((a, idx) => (
        <AnswerCard
          key={a.id}
          id={a.id}
          text={a.text}
          streaming={false}
          copiedId={copiedId}
          onCopy={handleCopy}
          faded={idx > 0}
        />
      ))}
    </div>
  )
}

function PulsingDot() {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: 'var(--ai-glow)',
        display: 'inline-block',
        animation: 'pulse 1.4s ease-in-out infinite',
        flexShrink: 0,
      }}
    />
  )
}

interface AnswerCardProps {
  id: string
  text: string
  streaming: boolean
  copiedId: string | null
  onCopy: (id: string, text: string) => void
  faded?: boolean
}

function AnswerCard({ id, text, streaming, copiedId, onCopy, faded }: AnswerCardProps) {
  const isCopied = copiedId === id

  const cardStyle: React.CSSProperties = {
    borderRadius: 'var(--r-md)',
    border: `1px solid ${streaming ? 'color-mix(in srgb, var(--ai-glow) 30%, transparent)' : 'var(--border-subtle)'}`,
    background: streaming
      ? 'color-mix(in srgb, var(--ai-glow) 5%, var(--surface-1))'
      : 'var(--surface-1)',
    padding: '10px 12px',
    fontSize: 13,
    opacity: faded ? 0.55 : 1,
    transition: 'opacity 200ms ease',
    animation: streaming ? undefined : 'fade-in 200ms ease both',
  }

  return (
    <div style={cardStyle}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--ai-glow)', fontWeight: 700, flex: 1 }}>
          {streaming ? '✨ AI yozmoqda…' : '✨ AI tavsiya'}
        </span>
        {!streaming && text && (
          <button
            onClick={() => onCopy(id, text)}
            title="Nusxa olish"
            style={{
              background: isCopied ? 'var(--success)' : 'none',
              border: `1px solid ${isCopied ? 'var(--success)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              color: isCopied ? '#fff' : 'var(--text-muted)',
              fontSize: 10,
              padding: '2px 7px',
              fontWeight: 600,
              transition: 'all 150ms ease',
              flexShrink: 0,
            }}
          >
            {isCopied ? '✓ Nusxa' : 'Nusxa'}
          </button>
        )}
      </div>

      {/* Answer text */}
      <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.6 }}>
        {text || <span style={{ color: 'var(--text-muted)' }}>…</span>}
        {streaming && (
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 14,
              background: 'var(--ai-glow)',
              marginLeft: 2,
              verticalAlign: 'middle',
              animation: 'blink 1s step-start infinite',
            }}
          />
        )}
      </p>
    </div>
  )
}
