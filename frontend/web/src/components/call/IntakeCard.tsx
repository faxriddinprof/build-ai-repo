import type React from 'react'
import { Icon } from '../Icon'
import { Button } from '../primitives/Button'
import type { IntakeProposal } from '../../types/session'

export interface IntakeCardProps {
  data: IntakeProposal
  onConfirm: () => void
  onEdit: () => void
  onDismiss: () => void
}

interface RowProps {
  icon: string
  label: string
  value: string
}

function Row({ icon, label, value }: RowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
        <Icon name={icon} size={15} />
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 70, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

export function IntakeCard({ data, onConfirm, onEdit, onDismiss }: IntakeCardProps) {
  const cardStyle: React.CSSProperties = {
    width: 360,
    background: 'var(--surface-glass)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid var(--ai-glow-edge)',
    borderRadius: 'var(--r-lg)',
    boxShadow: 'var(--shadow-floating)',
    overflow: 'hidden',
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--ai-glow-soft)',
        }}
      >
        <span style={{ color: 'var(--ai-glow)' }}>
          <Icon name="sparkles" size={16} />
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ai-glow)' }}>
          Avtomatik to'ldirildi
        </span>
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            padding: 2,
          }}
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '4px 16px' }}>
        <Row icon="user"   label="Ism"     value={data.customerName} />
        <Row icon="key"    label="Pasport" value={data.customerPassport} />
        <Row icon="shield" label="Hudud"   value={data.customerRegion} />
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <Button variant="primary" size="sm" onClick={onConfirm} style={{ flex: 1 }}>
          Tasdiqlash
        </Button>
        <Button variant="secondary" size="sm" onClick={onEdit} icon="edit">
          Tahrirlash
        </Button>
      </div>
    </div>
  )
}
