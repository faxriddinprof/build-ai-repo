import type React from 'react'

export interface CardProps {
  variant?: 'default' | 'glass' | 'flat'
  glow?: boolean
  children?: React.ReactNode
  style?: React.CSSProperties
  padding?: number | string
  onClick?: () => void
}

export function Card({ variant = 'default', glow, children, style, padding = 20, onClick }: CardProps) {
  const variants: Record<string, React.CSSProperties> = {
    default: {
      background: 'var(--surface-1)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-card)',
    },
    glass: {
      background: 'var(--surface-glass)',
      border: '1px solid var(--ai-glow-edge)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      boxShadow: 'var(--shadow-ai-glow)',
    },
    flat: {
      background: 'var(--surface-2)',
      border: '1px solid var(--border-subtle)',
    },
  }
  return (
    <div
      onClick={onClick}
      style={{
        ...variants[variant],
        borderRadius: 'var(--r-lg)',
        padding,
        ...(glow ? { boxShadow: 'var(--shadow-ai-glow)' } : {}),
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  )
}
