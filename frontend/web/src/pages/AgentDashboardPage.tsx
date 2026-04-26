import type React from 'react'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCallSession } from '../hooks/useCallSession'
import { useScriptedSession } from '../hooks/useScriptedSession'
import { useQueue } from '../hooks/useQueue'
import { useDemoModeStore } from '../store/demoModeStore'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { DEMO_TIMELINE } from '../data/demoTimeline'
import { fmtTime, maskPhone } from '../lib/format'
import api from '../lib/api'

import { Logo } from '../components/primitives/Logo'
import { Avatar } from '../components/primitives/Avatar'
import { Badge } from '../components/primitives/Badge'
import { Button } from '../components/primitives/Button'
import { LiveDot } from '../components/primitives/LiveDot'
import { SentimentBadge } from '../components/primitives/Badge'

import { Icon } from '../components/Icon'
import { DemoModeToggle } from '../components/DemoModeToggle'
import { TranscriptBubble } from '../components/call/TranscriptBubble'
import { SuggestionCard } from '../components/call/SuggestionCard'
import { IntakeCard } from '../components/call/IntakeCard'
import { ComplianceChip } from '../components/call/ComplianceChip'
import { QueueRail } from '../components/queue/QueueRail'
import { PostCallSummary } from '../components/PostCallSummary'

// ---------------------------------------------------------------------------
// We render BOTH hooks unconditionally (Rules of Hooks), but only use the
// active one's returned state/methods.
// ---------------------------------------------------------------------------
export default function AgentDashboardPage() {
  const demoEnabled = useDemoModeStore((s) => s.enabled)
  const logout = useAuthStore((s) => s.logout)
  const { theme, setTheme } = useThemeStore()
  const [searchParams, setSearchParams] = useSearchParams()

  const realSession = useCallSession()
  const demoSession = useScriptedSession()
  const session = demoEnabled ? demoSession : realSession

  const { queue, accept, skip } = useQueue()

  // Copy toast
  const [copyToast, setCopyToast] = useState(false)
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [queueOpen, setQueueOpen] = useState(true)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const acceptErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resume call from URL param on page refresh (real mode only)
  useEffect(() => {
    if (demoEnabled) return
    const callId = searchParams.get('call_id')
    if (!callId) return
    api.get<{ ended_at: string | null }>(`/api/calls/${callId}`)
      .then(({ data }) => {
        if (!data.ended_at) {
          realSession.start(callId)
        } else {
          setSearchParams((p) => { p.delete('call_id'); return p }, { replace: true })
        }
      })
      .catch(() => {
        setSearchParams((p) => { p.delete('call_id'); return p }, { replace: true })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear call_id param whenever session ends for any reason
  useEffect(() => {
    if (!demoEnabled && session.status === 'ended') {
      setSearchParams((p) => { p.delete('call_id'); return p }, { replace: true })
    }
  }, [session.status, demoEnabled, setSearchParams])

  const handleCopy = useCallback(() => {
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current)
    setCopyToast(true)
    copyToastTimerRef.current = setTimeout(() => setCopyToast(false), 1500)
  }, [])

  // Auto-scroll transcript to bottom
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.transcripts.length])

  // Accept flow
  const handleAccept = useCallback(
    async (queueId: string) => {
      try {
        const { callId } = await accept(queueId)
        if (!demoEnabled) {
          setSearchParams({ call_id: callId }, { replace: true })
        }
        session.start(callId)
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status
        const msg = status === 409
          ? "Avval joriy qo'ng'iroqni yakunlang"
          : "Qabul qilib bo'lmadi"
        if (acceptErrorTimerRef.current) clearTimeout(acceptErrorTimerRef.current)
        setAcceptError(msg)
        acceptErrorTimerRef.current = setTimeout(() => setAcceptError(null), 3000)
      }
    },
    [accept, demoEnabled, session, setSearchParams],
  )

  // End call
  const handleEndCall = useCallback(() => {
    session.endCall()
    if (!demoEnabled) {
      setSearchParams((p) => { p.delete('call_id'); return p }, { replace: true })
    }
  }, [demoEnabled, session, setSearchParams])

  // Reset after summary close
  const handleSummaryClose = useCallback(() => {
    realSession.reset()
    demoSession.reset()
    setSearchParams((p) => { p.delete('call_id'); return p }, { replace: true })
  }, [realSession, demoSession, setSearchParams])

  // Determine compliance items to show
  const complianceItems = DEMO_TIMELINE.compliance

  // Intake visibility
  const intakeVisible =
    session.intakeProposal !== null &&
    !session.intakeDismissed &&
    !session.intakeConfirmed

  const customerName = session.intakeConfirmed && session.intakeProposal
    ? session.intakeProposal.customerName
    : 'Mijoz'

  const maskedPhone = session.intakeConfirmed && session.intakeProposal
    ? maskPhone('')
    : ''

  // -------------------------------------------------------------------------
  // Layout styles
  // -------------------------------------------------------------------------
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-page)',
    color: 'var(--text-primary)',
  }

  const topbarStyle: React.CSSProperties = {
    height: 56,
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--surface-1)',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '0 20px',
    flexShrink: 0,
    boxShadow: 'var(--shadow-card)',
    position: 'sticky',
    top: 0,
    zIndex: 30,
  }

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  }

  const transcriptPanelStyle: React.CSSProperties = {
    flex: 1,
    borderRight: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  }

  const suggestionPanelStyle: React.CSSProperties = {
    flex: 1,
    background: 'var(--surface-2)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  }

  const panelHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
    background: 'var(--surface-1)',
  }

  const footerStyle: React.CSSProperties = {
    borderTop: '1px solid var(--border-subtle)',
    background: 'var(--surface-1)',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    flexWrap: 'wrap',
  }

  const doneCount = session.complianceDone.length
  const totalCount = complianceItems.length

  return (
    <div style={pageStyle}>
      {/* ------------------------------------------------------------------ */}
      {/* Topbar */}
      {/* ------------------------------------------------------------------ */}
      <header style={topbarStyle}>
        <Logo size={26} />
        <div style={{ width: 1, height: 28, background: 'var(--border-subtle)', flexShrink: 0 }} />

        {/* Timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 64 }}>
          {session.status === 'active' && <LiveDot size={7} />}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 15,
              fontWeight: 700,
              color: session.status === 'active' ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {fmtTime(session.callTime)}
          </span>
        </div>

        {/* Customer pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-full)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Avatar name={customerName} size={24} />
          <span style={{ fontSize: 13, fontWeight: 550 }}>{customerName}</span>
          {maskedPhone && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
              {maskedPhone}
            </span>
          )}
        </div>

        {/* Sentiment */}
        <SentimentBadge sentiment={session.sentiment} />

        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
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

        {/* Demo toggle */}
        <DemoModeToggle />

        {/* Agent avatar */}
        <button
          onClick={() => logout()}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderRadius: 'var(--r-md)',
            color: 'var(--text-secondary)',
            fontSize: 13,
          }}
          title="Chiqish"
        >
          <Avatar name="Diyora S." size={28} />
          <span>Diyora S.</span>
          <Icon name="logout" size={14} />
        </button>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Body */}
      {/* ------------------------------------------------------------------ */}
      <div style={bodyStyle}>
        {/* Left: Transcript */}
        <section style={transcriptPanelStyle}>
          <div style={panelHeaderStyle}>
            <Icon name="mic" size={15} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>Jonli transkripsiya</span>
            <Badge tone="blue" size="sm" icon={session.status === 'active' ? <LiveDot size={6} color="var(--sqb-blue-600)" /> : undefined}>
              {session.status === 'active' ? <span style={{ marginLeft: 4 }}>O'zbek + Rus</span> : <span>O'zbek + Rus</span>}
            </Badge>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
            {session.transcripts.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 12,
                  color: 'var(--text-muted)',
                }}
              >
                <Icon name="mic" size={32} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 14 }}>Qo'ng'iroq kutilmoqda…</span>
              </div>
            ) : (
              <>
                {session.transcripts.map((entry) => (
                  <TranscriptBubble
                    key={entry.id}
                    speaker={entry.speaker}
                    text={entry.text}
                    time={fmtTime(entry.ts)}
                  />
                ))}
                {/* AI listening indicator */}
                {session.status === 'active' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 8px', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          style={{
                            display: 'inline-block',
                            width: 3,
                            height: 14,
                            background: 'var(--ai-glow)',
                            borderRadius: 2,
                            opacity: 0.6,
                            transformOrigin: 'bottom',
                            animation: `equalizer ${0.7 + i * 0.2}s ease-in-out ${i * 0.12}s infinite`,
                          }}
                        />
                      ))}
                    </span>
                    <span style={{ fontSize: 12 }}>Tinglamoqda…</span>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </>
            )}
          </div>
        </section>

        {/* Right: Suggestions */}
        <section style={suggestionPanelStyle}>
          <div style={{ ...panelHeaderStyle, background: 'var(--surface-2)' }}>
            <Icon name="sparkles" size={15} style={{ color: aiEnabled ? 'var(--ai-glow)' : 'var(--text-muted)' }} />
            <span style={{ fontWeight: 600, fontSize: 14, flex: 1, color: aiEnabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              AI Tavsiyalar
            </span>
            {aiEnabled && session.suggestions.length > 0 && (
              <Badge tone="ai" size="sm">{session.suggestions.length}</Badge>
            )}
            {aiEnabled && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                ~1.4s kechikish
              </span>
            )}
            {/* AI toggle */}
            <button
              onClick={() => setAiEnabled((v) => !v)}
              title={aiEnabled ? "AI yordamini o'chirish" : "AI yordamini yoqish"}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 'var(--r-full)',
                border: `1px solid ${aiEnabled ? 'var(--ai-glow)' : 'var(--border-default)'}`,
                background: aiEnabled ? 'var(--ai-glow-soft)' : 'var(--surface-1)',
                color: aiEnabled ? 'var(--ai-glow)' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 150ms ease',
                letterSpacing: '0.02em',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: aiEnabled ? 'var(--ai-glow)' : 'var(--text-muted)',
                  transition: 'background 150ms ease',
                }}
              />
              {aiEnabled ? 'Yoqilgan' : "O'chirilgan"}
            </button>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            opacity: aiEnabled ? 1 : 0.4,
            pointerEvents: aiEnabled ? 'auto' : 'none',
            transition: 'opacity 200ms ease',
          }}>
            {!aiEnabled ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 10,
                color: 'var(--text-muted)',
              }}>
                <Icon name="sparkles" size={28} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 13 }}>AI yordami o'chirilgan</span>
              </div>
            ) : session.suggestions.length === 0 ? (
              <SuggestionCard variant="empty" />
            ) : (
              session.suggestions.map((sg) => (
                <SuggestionCard
                  key={sg.id}
                  variant="settled"
                  trigger={sg.trigger}
                  bullets={sg.bullets}
                  age={session.callTime - sg.arrivedAt}
                  onCopy={handleCopy}
                />
              ))
            )}
          </div>

          {/* Accept error toast */}
          {acceptError && (
            <div
              style={{
                position: 'absolute',
                bottom: 80,
                right: 296,
                background: 'var(--danger)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: 'var(--r-full)',
                boxShadow: 'var(--shadow-floating)',
                animation: 'slide-in-top 200ms var(--ease-spring) both',
                pointerEvents: 'none',
              }}
            >
              {acceptError}
            </div>
          )}

          {/* Copy toast */}
          {copyToast && (
            <div
              style={{
                position: 'absolute',
                bottom: 80,
                right: 296,
                background: 'var(--success)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: 'var(--r-full)',
                boxShadow: 'var(--shadow-floating)',
                animation: 'slide-in-top 200ms var(--ease-spring) both',
                pointerEvents: 'none',
              }}
            >
              +Nusxa olindi
            </div>
          )}
        </section>

        {/* Queue rail toggle button */}
        {!queueOpen && (
          <button
            onClick={() => setQueueOpen(true)}
            style={{
              position: 'absolute',
              top: 14,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRight: 'none',
              borderRadius: 'var(--r-md) 0 0 var(--r-md)',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-secondary)',
              zIndex: 5,
            }}
          >
            <Icon name="users" size={14} />
            {queue.length > 0 && (
              <span style={{
                background: 'var(--sqb-blue-600)',
                color: '#fff',
                borderRadius: 99,
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 5px',
                minWidth: 16,
                textAlign: 'center',
              }}>
                {queue.length}
              </span>
            )}
            <Icon name="chevron-left" size={12} />
          </button>
        )}

        {/* Queue rail */}
        {queueOpen && (
          <QueueRail
            queue={queue}
            onToggle={() => setQueueOpen(false)}
            onAccept={handleAccept}
            onSkip={(queueId, reason, note) => void skip(queueId, reason, note)}
            callActive={session.status === 'active'}
          />
        )}

        {/* Intake card floating */}
        {intakeVisible && session.intakeProposal && (
          <div style={{ position: 'absolute', top: 24, right: 304, zIndex: 20 }}>
            <IntakeCard
              data={session.intakeProposal}
              onConfirm={() =>
                session.confirmIntake({
                  customer_name: session.intakeProposal!.customerName,
                  customer_passport: session.intakeProposal!.customerPassport,
                  customer_region: session.intakeProposal!.customerRegion,
                })
              }
              onEdit={() => {
                // For now, treat edit same as confirm — intake editing can be Phase 4
                session.confirmIntake({
                  customer_name: session.intakeProposal!.customerName,
                  customer_passport: session.intakeProposal!.customerPassport,
                  customer_region: session.intakeProposal!.customerRegion,
                })
              }}
              onDismiss={() => session.dismissIntake()}
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Compliance Footer — only during/after call */}
      {/* ------------------------------------------------------------------ */}
      {session.status !== 'idle' && <footer style={footerStyle}>
        <span style={{ color: 'var(--text-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="clipboard" size={15} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Compliance</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: doneCount === totalCount ? 'var(--success)' : 'var(--text-muted)' }}>
            {doneCount}/{totalCount}
          </span>
        </span>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {complianceItems.map((item) => {
            const isDone = session.complianceDone.includes(item.id)
            return (
              <ComplianceChip
                key={item.id}
                status={isDone ? 'done' : session.status === 'ended' ? 'missed' : 'pending'}
                label={item.label}
              />
            )
          })}
        </div>

        {session.status === 'active' && (
          <Button variant="danger" size="sm" icon="phone-off" onClick={handleEndCall}>
            Yakunlash
          </Button>
        )}
      </footer>}

      {/* ------------------------------------------------------------------ */}
      {/* Modals */}
      {/* ------------------------------------------------------------------ */}
      {session.status === 'ended' && session.summary && (
        <PostCallSummary
          summary={session.summary}
          callTime={session.callTime}
          onClose={handleSummaryClose}
        />
      )}
    </div>
  )
}
