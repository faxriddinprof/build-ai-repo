import type React from 'react'
import { Icon } from '../Icon'

export interface ComplianceChipProps {
  status: 'done' | 'pending' | 'missed'
  label: string
  flash?: boolean
}

export function ComplianceChip({ status, label, flash }: ComplianceChipProps) {
  const styles: Record<string, React.CSSProperties> = {
    done: {
      background: 'var(--success-bg)',
      color: 'var(--success)',
      border: '1px solid transparent',
    },
    pending: {
      background: 'var(--surface-2)',
      color: 'var(--text-muted)',
      border: '1px solid var(--border-subtle)',
    },
    missed: {
      background: 'var(--danger-bg)',
      color: 'var(--danger)',
      border: '1px solid transparent',
    },
  }

  const iconName = status === 'done' ? 'check' : status === 'missed' ? 'x' : undefined

  const chipStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: 'var(--r-full)',
    fontSize: 12,
    fontWeight: 550,
    whiteSpace: 'nowrap',
    animation: flash ? 'pulse-dot 0.8s ease-in-out 3' : undefined,
    ...styles[status],
  }

  return (
    <span style={chipStyle}>
      {iconName ? (
        <Icon name={iconName} size={12} />
      ) : (
        <span
          style={{
            width: 10,
            height: 10,
            border: '1.5px solid var(--border-default)',
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  )
}
