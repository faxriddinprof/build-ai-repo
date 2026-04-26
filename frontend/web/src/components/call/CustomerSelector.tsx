import type React from 'react'
import type { DemoClient } from '../../hooks/useDemoClients'

const RISK_COLORS: Record<DemoClient['risk_category'], string> = {
  low: 'var(--success)',
  medium: '#f59e0b',
  high: '#ef4444',
}

const RISK_LABELS: Record<DemoClient['risk_category'], string> = {
  low: 'Past xavf',
  medium: "O'rta xavf",
  high: 'Yuqori xavf',
}

interface CustomerSelectorProps {
  clients: DemoClient[]
  selectedId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}

export function CustomerSelector({
  clients,
  selectedId,
  onSelect,
  disabled,
}: CustomerSelectorProps) {
  if (clients.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          padding: '8px 0',
        }}
      >
        Mijozlar yuklanmoqda…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          margin: 0,
        }}
      >
        Demo mijozlar
      </p>
      {clients.map((c) => {
        const isSelected = selectedId === c.client_id
        const btnStyle: React.CSSProperties = {
          width: '100%',
          textAlign: 'left',
          padding: '8px 12px',
          borderRadius: 'var(--r-md)',
          border: isSelected ? '1.5px solid var(--sqb-blue-600)' : '1px solid var(--border-subtle)',
          background: isSelected ? 'rgba(59,130,246,0.10)' : 'var(--surface-1)',
          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled && !isSelected ? 0.5 : 1,
          transition: 'border-color 150ms ease, background 150ms ease',
          outline: 'none',
          fontSize: 13,
        }

        return (
          <button
            key={c.client_id}
            onClick={() => !disabled && onSelect(c.client_id)}
            disabled={disabled}
            style={btnStyle}
          >
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{c.display_name}</div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                fontSize: 11,
                color: 'var(--text-muted)',
                flexWrap: 'wrap',
              }}
            >
              <span>{c.region}</span>
              <span style={{ color: RISK_COLORS[c.risk_category] }}>
                {RISK_LABELS[c.risk_category]}
              </span>
              {c.has_loan && <span>Kredit</span>}
              {c.has_deposit && <span>Omonat</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
