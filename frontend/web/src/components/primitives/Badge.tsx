import type React from 'react'
import { LiveDot } from './LiveDot'

export interface BadgeProps {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'ai' | 'blue'
  icon?: React.ReactNode
  children?: React.ReactNode
  glow?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function Badge({ tone = 'neutral', icon, children, glow, size = 'md' }: BadgeProps) {
  const tones: Record<string, { bg: string; color: string; border: string }> = {
    neutral: { bg: 'var(--surface-3)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' },
    success: { bg: 'var(--success-bg)', color: 'var(--success)', border: 'transparent' },
    warning: { bg: 'var(--warning-bg)', color: 'var(--warning)', border: 'transparent' },
    danger: { bg: 'var(--danger-bg)', color: 'var(--danger)', border: 'transparent' },
    ai: { bg: 'var(--ai-glow-soft)', color: 'var(--ai-glow)', border: 'var(--ai-glow-edge)' },
    blue: { bg: 'var(--sqb-blue-50)', color: 'var(--sqb-blue-700)', border: 'var(--sqb-blue-100)' },
  }
  const t = tones[tone]
  const sizes: Record<string, React.CSSProperties> = {
    sm: { fontSize: 11, padding: '3px 8px', gap: 4, height: 22 },
    md: { fontSize: 12, padding: '4px 10px', gap: 5, height: 26 },
    lg: { fontSize: 13, padding: '6px 12px', gap: 6, height: 30 },
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        ...sizes[size],
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        borderRadius: 'var(--r-full)',
        fontWeight: 550,
        letterSpacing: '0.005em',
        whiteSpace: 'nowrap',
        ...(glow ? { boxShadow: '0 0 16px var(--ai-glow-soft)' } : {}),
      }}
    >
      {icon}
      {children}
    </span>
  )
}

export interface SentimentBadgeProps {
  sentiment: 'positive' | 'neutral' | 'negative'
}

export function SentimentBadge({ sentiment }: SentimentBadgeProps) {
  const map: Record<string, { tone: BadgeProps['tone']; label: string; color: string }> = {
    positive: { tone: 'success', label: 'Ijobiy', color: 'var(--success)' },
    neutral: { tone: 'warning', label: 'Neytral', color: 'var(--warning)' },
    negative: { tone: 'danger', label: 'Salbiy', color: 'var(--danger)' },
  }
  const m = map[sentiment] ?? map['neutral']
  return (
    <Badge tone={m.tone} size="lg" icon={<LiveDot color={m.color} size={7} />}>
      <span style={{ marginLeft: 4 }}>{m.label}</span>
    </Badge>
  )
}
