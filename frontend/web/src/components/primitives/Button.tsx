import type React from 'react'
import { Icon } from '../Icon'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  children?: React.ReactNode
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  style?: React.CSSProperties
  type?: 'button' | 'submit' | 'reset'
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  onClick,
  disabled,
  style,
  type = 'button',
  fullWidth,
}: ButtonProps) {
  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: '6px 12px', fontSize: 13, height: 32, gap: 6 },
    md: { padding: '9px 16px', fontSize: 14, height: 40, gap: 8 },
    lg: { padding: '12px 22px', fontSize: 15, height: 48, gap: 10 },
  }
  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--sqb-blue-600)',
      color: 'var(--text-on-blue)',
      border: '1px solid var(--sqb-blue-700)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.1) inset, 0 1px 2px rgba(11,61,145,0.2)',
    },
    secondary: {
      background: 'var(--surface-1)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-default)',
      boxShadow: 'var(--shadow-card)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: '1px solid transparent',
    },
    danger: {
      background: 'var(--danger)',
      color: '#fff',
      border: '1px solid #B91C1C',
      boxShadow: '0 1px 2px rgba(220,38,38,0.25)',
    },
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...sizes[size],
        ...variants[variant],
        borderRadius: 'var(--r-md)',
        fontWeight: 550,
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 120ms var(--ease-smooth), box-shadow 120ms var(--ease-smooth), filter 120ms',
        width: fullWidth ? '100%' : undefined,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      onMouseDown={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'scale(0.98)'
        }
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  )
}
