import type { DemoClient } from '../../hooks/useDemoClients'

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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Demo mijozlar
      </label>
      <select
        value={selectedId ?? ''}
        onChange={(e) => e.target.value && onSelect(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 'var(--r-md)',
          border: selectedId
            ? '1.5px solid var(--sqb-blue-600)'
            : '1px solid var(--border-default)',
          background: 'var(--surface-1)',
          color: selectedId ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: 13,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          outline: 'none',
          appearance: 'auto',
        }}
      >
        <option value="">— Mijozni tanlang —</option>
        {clients.map((c) => (
          <option key={c.client_id} value={c.client_id}>
            {c.display_name} · {c.region} · {RISK_LABELS[c.risk_category]}
            {c.has_loan ? ' · Kredit' : ''}
            {c.has_deposit ? ' · Omonat' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
