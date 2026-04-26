import type React from 'react'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCallSession } from '../hooks/useCallSession'
import { useScriptedSession } from '../hooks/useScriptedSession'
import { useDemoModeStore } from '../store/demoModeStore'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { DEMO_TIMELINE } from '../data/demoTimeline'
import { fmtTime } from '../lib/format'
import api from '../lib/api'

import { Logo } from '../components/primitives/Logo'
import { Avatar } from '../components/primitives/Avatar'
import { Badge } from '../components/primitives/Badge'
import { Button } from '../components/primitives/Button'
import { LiveDot } from '../components/primitives/LiveDot'
import { SentimentBadge } from '../components/primitives/Badge'

import { Icon } from '../components/Icon'
import { DemoModeToggle } from '../components/DemoModeToggle'
import { ChatThread } from '../components/call/ChatThread'
import { SuggestionCard } from '../components/call/SuggestionCard'
import { ComplianceChip } from '../components/call/ComplianceChip'
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

  // Copy toast
  const [copyToast, setCopyToast] = useState(false)
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aiEnabled, setAiEnabled] = useState(true)

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

  // Start a new call — creates call via API then starts session
  const handleStartCall = useCallback(async () => {
    if (demoEnabled) {
      // In demo mode, use a synthetic call ID
      session.start('demo-call-' + Date.now())
      return
    }
    try {
      const res = await api.post<{ id: string }>('/api/calls', {})
      const callId = res.data.id
      setSearchParams({ call_id: callId }, { replace: true })
      realSession.start(callId)
    } catch (err) {
      console.error('Failed to create call', err)
    }
  }, [demoEnabled, session, realSession, setSearchParams])

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

  const chatPanelStyle: React.CSSProperties = {
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

        {/* Mode chip */}
        <Badge tone={demoEnabled ? 'ai' : 'blue'} size="sm">
          {demoEnabled ? 'Demo rejimi' : 'Self-talk rejimi'}
        </Badge>

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
        {/* Left: Chat Thread */}
        <section style={chatPanelStyle}>
          <div style={panelHeaderStyle}>
            <Icon name="mic" size={15} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>Suhbat</span>
            <Badge tone="blue" size="sm" icon={session.status === 'active' ? <LiveDot size={6} color="var(--sqb-blue-600)" /> : undefined}>
              {session.status === 'active' ? <span style={{ marginLeft: 4 }}>O'zbek + Rus</span> : <span>O'zbek + Rus</span>}
            </Badge>
          </div>

          {/* Chat thread grows to fill, start/stop button pinned at bottom */}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <ChatThread
              transcripts={session.transcripts}
              aiAnswers={session.aiAnswers}
              isListening={session.status === 'active'}
            />
          </div>

          {/* Start / Stop button */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--surface-1)',
              display: 'flex',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {session.status === 'idle' || session.status === 'ended' ? (
              <Button variant="primary" size="md" icon="mic" onClick={handleStartCall}>
                Suhbatni boshlash
              </Button>
            ) : session.status === 'connecting' ? (
              <Button variant="primary" size="md" disabled>
                Ulanmoqda…
              </Button>
            ) : (
              <Button variant="danger" size="md" icon="phone-off" onClick={handleEndCall}>
                Tugatish
              </Button>
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

          {/* Copy toast */}
          {copyToast && (
            <div
              style={{
                position: 'absolute',
                bottom: 80,
                right: 16,
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
