import type React from 'react'
import { Button } from './primitives/Button'
import { Badge } from './primitives/Badge'
import { fmtTime } from '../lib/format'
import type { CallSummary } from '../types/session'

export interface PostCallSummaryProps {
  summary: CallSummary
  callTime: number
  onClose: () => void
}

export function PostCallSummary({ summary, callTime, onClose }: PostCallSummaryProps) {
  const natija = summary.natija ?? summary.outcome
  const etirozlar = summary.etirozlar ?? summary.objections ?? []
  const keyingiQadam = summary.keyingiQadam ?? summary.nextAction
  const compliance = summary.complianceHolati
  const duration = summary.callDuration ?? fmtTime(callTime)

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
    padding: 16,
  }

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 560,
    background: 'var(--surface-1)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--r-xl)',
    boxShadow: 'var(--shadow-modal)',
    overflow: 'hidden',
    animation: 'slide-in-top 300ms var(--ease-spring) both',
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Qo'ng'iroq yakunlandi
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Davomiylik:{' '}
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {duration}
              </span>
            </div>
          </div>
          {summary.sentiment && (
            <Badge
              tone={
                summary.sentiment === 'positive'
                  ? 'success'
                  : summary.sentiment === 'negative'
                  ? 'danger'
                  : 'warning'
              }
              size="md"
            >
              {summary.sentiment === 'positive' ? 'Ijobiy' : summary.sentiment === 'negative' ? 'Salbiy' : 'Neytral'}
            </Badge>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', maxHeight: '60vh', overflowY: 'auto' }}>
          {/* Outcome */}
          {natija && (
            <Section title="Natija">
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {natija}
              </p>
            </Section>
          )}

          {/* Objections */}
          {etirozlar.length > 0 && (
            <Section title="E'tirozlar">
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {etirozlar.map((obj, i) => (
                  <li key={i} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 4 }}>
                    {obj}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Next action */}
          {keyingiQadam && (
            <Section title="Keyingi qadam">
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {keyingiQadam}
              </p>
            </Section>
          )}

          {/* Compliance score */}
          {compliance && (
            <Section title="Compliance holati">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    background: 'var(--surface-3)',
                    borderRadius: 'var(--r-full)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(compliance.passed / compliance.total) * 100}%`,
                      background: 'var(--success)',
                      borderRadius: 'var(--r-full)',
                      transition: 'width 600ms var(--ease-smooth)',
                    }}
                  />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--success)', whiteSpace: 'nowrap' }}>
                  {compliance.passed}/{compliance.total}
                </span>
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="primary" icon="phone" onClick={onClose}>
            Yangi qo'ng'iroq
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}
