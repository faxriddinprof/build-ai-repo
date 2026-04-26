import type React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSupervisorFeed } from '../hooks/useSupervisorFeed'
import type { ActiveCall } from '../hooks/useSupervisorFeed'
import { useCallTranscript } from '../hooks/useCallTranscript'
import { useCallHistory } from '../hooks/useCallHistory'
import type { CallHistoryItem } from '../hooks/useCallHistory'
import { fmtTime } from '../lib/format'
import { SentimentBadge } from '../components/primitives/Badge'
import { TranscriptBubble } from '../components/call/TranscriptBubble'
import { Icon } from '../components/Icon'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

// ---------------------------------------------------------------------------
// Active call card
// ---------------------------------------------------------------------------
function ActiveCallCard({ call, onClick }: { call: ActiveCall; onClick: () => void }) {
  const [localDuration, setLocalDuration] = useState(call.duration)

  useEffect(() => {
    setLocalDuration(call.duration)
    const id = setInterval(() => setLocalDuration((d) => d + 1), 1000)
    return () => clearInterval(id)
  }, [call.id, call.duration])

  const sentimentColor =
    call.sentiment === 'positive'
      ? 'var(--success)'
      : call.sentiment === 'negative'
        ? 'var(--danger)'
        : 'var(--text-muted)'

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface-2)',
        border: `1px solid ${call.isHero ? 'var(--sqb-blue-500)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--r-lg)',
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'border-color 150ms, box-shadow 150ms',
        boxShadow: call.isHero ? '0 0 0 2px var(--sqb-blue-100)' : undefined,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = 'var(--sqb-blue-500)'
        el.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = call.isHero ? 'var(--sqb-blue-500)' : 'var(--border-subtle)'
        el.style.boxShadow = call.isHero ? '0 0 0 2px var(--sqb-blue-100)' : ''
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: sentimentColor,
              flexShrink: 0,
              boxShadow: `0 0 6px ${sentimentColor}`,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{call.name}</span>
        </div>
        <SentimentBadge sentiment={call.sentiment} />
      </div>

      {/* Agent + region row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <Icon name="user" size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          {call.agentId}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {call.customerRegion}
        </span>
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          ⏱ {fmtTime(localDuration)}
        </span>
      </div>

      {/* Top objection */}
      {call.topObjection && (
        <div style={{ marginBottom: 10 }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--warning)',
              background: 'var(--warning-bg)',
              borderRadius: 'var(--r-sm)',
              padding: '3px 8px',
            }}
          >
            {call.topObjection}
          </span>
        </div>
      )}

      {/* Phone */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{call.customerPhone}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------
function TranscriptDrawer({ callId, onClose }: { callId: string; onClose: () => void }) {
  const { data: transcript = [], isLoading } = useCallTranscript(callId)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcript.length])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
          animation: 'fade-in 200ms both',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 420,
          height: '100vh',
          background: 'var(--surface-1)',
          borderLeft: '1px solid var(--border-subtle)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slide-in-right 240ms var(--ease-smooth) both',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
            Qo'ng'iroq yozuvi
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 6,
              borderRadius: 'var(--r-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Privacy notice */}
        <div
          style={{
            margin: '12px 16px 0',
            padding: '10px 14px',
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--r-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <Icon name="lock" size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--warning)', lineHeight: 1.4 }}>
            Mijoz pasporti ma'lumotlari maxfiylashtirilgan
          </span>
        </div>

        {/* Transcript scroll area */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
          }}
        >
          {isLoading && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 32 }}>
              Yuklanmoqda…
            </div>
          )}
          {!isLoading && transcript.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 32 }}>
              Yozuv yo'q
            </div>
          )}
          {transcript.map((entry) => (
            <TranscriptBubble
              key={entry.id}
              speaker={entry.speaker}
              text={entry.text}
              time={fmtTime(entry.ts)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// History table
// ---------------------------------------------------------------------------
const OUTCOME_OPTIONS = [
  { value: '', label: 'Barcha natijalar' },
  { value: 'completed', label: 'Yakunlangan' },
  { value: 'failed', label: 'Muvaffaqiyatsiz' },
  { value: 'transferred', label: "Ko'chirilgan" },
]

function sentimentLabel(s: string) {
  if (s === 'positive') return 'Ijobiy'
  if (s === 'negative') return 'Salbiy'
  return 'Neytral'
}

function sentimentColor(s: string) {
  if (s === 'positive') return 'var(--success)'
  if (s === 'negative') return 'var(--danger)'
  return 'var(--text-muted)'
}

function HistoryTable() {
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const { data: history = [], isLoading } = useCallHistory({ outcome: outcomeFilter || undefined, limit: 50 })

  const thStyle: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  }

  const tdStyle: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  }

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Natija:</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {OUTCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setOutcomeFilter(opt.value)}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                borderRadius: 'var(--r-full)',
                border: `1px solid ${outcomeFilter === opt.value ? 'var(--sqb-blue-500)' : 'var(--border-subtle)'}`,
                background: outcomeFilter === opt.value ? 'var(--sqb-blue-50)' : 'var(--surface-2)',
                color: outcomeFilter === opt.value ? 'var(--sqb-blue-700)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: outcomeFilter === opt.value ? 600 : 400,
                transition: 'all 150ms',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Yuklanmoqda…</div>
      ) : history.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Tarix bo'sh</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Mijoz</th>
                <th style={thStyle}>Agent</th>
                <th style={thStyle}>Davomiyligi</th>
                <th style={thStyle}>Kayfiyat</th>
                <th style={thStyle}>Natija</th>
                <th style={thStyle}>Muvofiqlik</th>
                <th style={thStyle}>Sana</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row: CallHistoryItem) => (
                <tr key={row.id} style={{ transition: 'background 120ms' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                >
                  <td style={tdStyle}>{row.customerName}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{row.agentId}</td>
                  <td style={tdStyle}>{fmtTime(row.duration)}</td>
                  <td style={{ ...tdStyle, color: sentimentColor(row.sentiment) }}>
                    {sentimentLabel(row.sentiment)}
                  </td>
                  <td style={tdStyle}>
                    {row.outcome ? (
                      <span
                        style={{
                          fontSize: 12,
                          padding: '3px 8px',
                          borderRadius: 'var(--r-sm)',
                          background: 'var(--surface-3)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {row.outcome}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 60,
                          height: 6,
                          background: 'var(--border-subtle)',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${row.complianceScore}%`,
                            background: row.complianceScore >= 80 ? 'var(--success)' : row.complianceScore >= 50 ? 'var(--warning)' : 'var(--danger)',
                            borderRadius: 3,
                            transition: 'width 400ms var(--ease-smooth)',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.complianceScore}%</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                    {new Date(row.startedAt).toLocaleDateString('uz-UZ', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SupervisorPage() {
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [drawerCallId, setDrawerCallId] = useState<string | null>(null)
  const { activeCalls, isLoading } = useSupervisorFeed()
  const logout = useAuthStore((s) => s.logout)
  const { theme, setTheme } = useThemeStore()

  const handleCardClick = useCallback((id: string) => setDrawerCallId(id), [])
  const handleDrawerClose = useCallback(() => setDrawerCallId(null), [])

  const tabBtn = (value: 'active' | 'history', label: string) => (
    <button
      onClick={() => setTab(value)}
      style={{
        padding: '8px 20px',
        fontSize: 14,
        fontWeight: tab === value ? 600 : 400,
        color: tab === value ? 'var(--sqb-blue-500)' : 'var(--text-secondary)',
        borderBottom: tab === value ? '2px solid var(--sqb-blue-500)' : '2px solid transparent',
        background: 'none',
        border: 'none',
        borderBottomWidth: 2,
        borderBottomStyle: 'solid',
        borderBottomColor: tab === value ? 'var(--sqb-blue-500)' : 'transparent',
        cursor: 'pointer',
        transition: 'color 150ms, border-color 150ms',
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: 56,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)' }}>
            Nazorat paneli
          </span>
          {activeCalls.length > 0 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 'var(--r-full)',
                background: 'var(--sqb-blue-50)',
                color: 'var(--sqb-blue-700)',
                border: '1px solid var(--sqb-blue-100)',
              }}
            >
              {activeCalls.length} faol
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? "Yorug' rejim" : "Qorong'i rejim"}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 6,
              borderRadius: 'var(--r-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
          <button
            onClick={logout}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 'var(--r-sm)',
            }}
          >
            <Icon name="logout" size={16} />
            Chiqish
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 24px',
          background: 'var(--surface-2)',
          flexShrink: 0,
        }}
      >
        {tabBtn('active', "Faol qo'ng'iroqlar")}
        {tabBtn('history', 'Tarix')}
      </div>

      {/* Content */}
      <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {tab === 'active' && (
          <>
            {isLoading && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 48 }}>
                Yuklanmoqda…
              </div>
            )}
            {!isLoading && activeCalls.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  paddingTop: 80,
                  fontSize: 15,
                }}
              >
                <Icon name="phone" size={36} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
                Faol qo'ng'iroqlar yo'q
              </div>
            )}
            {!isLoading && activeCalls.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 16,
                }}
              >
                {activeCalls.map((call) => (
                  <ActiveCallCard
                    key={call.id}
                    call={call}
                    onClick={() => handleCardClick(call.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'history' && <HistoryTable />}
      </main>

      {/* Drawer */}
      {drawerCallId && (
        <TranscriptDrawer callId={drawerCallId} onClose={handleDrawerClose} />
      )}
    </div>
  )
}
