import type React from 'react'
import { useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { SKIP_REASONS } from '../../data/demoTimeline'
import type { QueueEntry } from '../../data/demoTimeline'

export interface QueueRailProps {
  queue: QueueEntry[]
  onToggle?: () => void
  onAccept?: (queueId: string) => void
  onSkip?: (queueId: string, reason: string, note?: string) => void
  callActive?: boolean
}

function fmtWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function waitColor(seconds: number): string {
  if (seconds > 120) return 'var(--danger)'
  if (seconds > 60) return 'var(--warning)'
  return 'var(--text-secondary)'
}

function priorityDotColor(priority: QueueEntry['priority']): string {
  if (priority === 'vip') return 'var(--ai-glow)'
  if (priority === 'high') return 'var(--warning)'
  return 'var(--text-muted)'
}

export function QueueRail({ queue, onToggle, onAccept, onSkip, callActive }: QueueRailProps) {
  const sorted = useMemo(
    () => [...queue].sort((a, b) => b.waitTime - a.waitTime),
    [queue],
  )

  const totalWait = queue.reduce((s, q) => s + q.waitTime, 0)
  const avgWait = queue.length > 0 ? Math.round(totalWait / queue.length) : 0
  const longestWait = queue.length > 0 ? Math.max(...queue.map((q) => q.waitTime)) : 0

  const asideStyle: React.CSSProperties = {
    width: 280,
    flexShrink: 0,
    borderLeft: '1px solid var(--border-subtle)',
    background: 'var(--surface-1)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  }

  return (
    <aside style={asideStyle}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>
          <Icon name="users" size={16} />
        </span>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>Navbat</span>
        <Badge tone="neutral" size="sm">
          {queue.length}
        </Badge>
        {onToggle && (
          <button
            onClick={onToggle}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 2,
              display: 'flex',
            }}
          >
            <Icon name="chevron-right" size={15} />
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          background: 'var(--surface-2)',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Eng uzun kutish</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: waitColor(longestWait), fontWeight: 600 }}>
            {fmtWait(longestWait)}
          </div>
        </div>
        <div style={{ width: 1, background: 'var(--border-subtle)', margin: '0 12px' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>O'rtacha kutish</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {fmtWait(avgWait)}
          </div>
        </div>
      </div>

      {/* Queue list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {sorted.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            Navbat bo'sh
          </div>
        ) : (
          sorted.map((entry, idx) => (
            <QueueCard
              key={entry.id}
              entry={entry}
              isNext={idx === 0}
              onAccept={onAccept}
              onSkip={onSkip}
              callActive={callActive}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function QueueCard({
  entry,
  isNext,
  onAccept,
  onSkip,
  callActive,
}: {
  entry: QueueEntry
  isNext: boolean
  onAccept?: (id: string) => void
  onSkip?: (id: string, reason: string, note?: string) => void
  callActive?: boolean
}) {
  const [showSkip, setShowSkip] = useState(false)
  const [skipReason, setSkipReason] = useState(SKIP_REASONS[0])
  const [skipNote, setSkipNote] = useState('')

  const handleSkipSubmit = () => {
    onSkip?.(entry.id, skipReason, skipNote.trim() || undefined)
    setShowSkip(false)
    setSkipNote('')
  }

  const hasActions = !!(onAccept || onSkip)

  return (
    <div
      style={{
        margin: '0 8px 6px',
        borderRadius: 'var(--r-md)',
        background: isNext ? 'var(--sqb-blue-50)' : 'var(--surface-2)',
        border: isNext ? '1px solid var(--sqb-blue-100)' : '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    >
      {/* Card info */}
      <div style={{ padding: '10px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: priorityDotColor(entry.priority),
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 600,
              flex: 1,
              color: 'var(--text-primary)',
              letterSpacing: '0.01em',
            }}
          >
            {entry.maskedPhone}
          </span>
          {isNext && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 'var(--r-full)',
                background: 'var(--sqb-blue-600)',
                color: '#fff',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              Keyingi
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
            {entry.region} · {entry.topic}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 600,
              color: waitColor(entry.waitTime),
            }}
          >
            {fmtWait(entry.waitTime)}
          </span>
        </div>
      </div>

      {/* Inline skip form */}
      {showSkip && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--surface-1)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 600 }}>
            O'tkazib yuborish sababi
          </div>
          <select
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              fontSize: 12,
              marginBottom: 5,
              fontFamily: 'var(--font-sans)',
            }}
          >
            {SKIP_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <textarea
            value={skipNote}
            onChange={(e) => setSkipNote(e.target.value)}
            placeholder="Izoh (ixtiyoriy)"
            rows={2}
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              fontSize: 12,
              resize: 'none',
              fontFamily: 'var(--font-sans)',
              boxSizing: 'border-box',
              marginBottom: 6,
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="danger" size="sm" onClick={handleSkipSubmit} style={{ flex: 1, fontSize: 11 }}>
              Tasdiqlash
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowSkip(false)} style={{ fontSize: 11 }}>
              Bekor
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {hasActions && !showSkip && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '6px 12px 10px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {onAccept && (
            <button
              onClick={() => !callActive && onAccept(entry.id)}
              disabled={callActive}
              style={{
                flex: 1,
                padding: '5px 0',
                borderRadius: 'var(--r-md)',
                border: 'none',
                background: callActive ? 'var(--border-subtle)' : 'var(--success)',
                color: callActive ? 'var(--text-muted)' : '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: callActive ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Icon name="phone" size={12} />
              Qabul
            </button>
          )}
          {onSkip && (
            <button
              onClick={() => setShowSkip(true)}
              style={{
                flex: 1,
                padding: '5px 0',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--surface-1)',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              O'tkazish
            </button>
          )}
        </div>
      )}
    </div>
  )
}
