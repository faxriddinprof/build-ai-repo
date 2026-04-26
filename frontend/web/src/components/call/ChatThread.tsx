import type React from 'react'
import { useEffect, useRef } from 'react'
import type { TranscriptEntry, AIAnswerEntry } from '../../types/session'

interface ChatItem {
  kind: 'transcript' | 'ai_answer'
  id: string
  text: string
  streaming?: boolean
  ts: number
}

interface ChatThreadProps {
  transcripts: TranscriptEntry[]
  aiAnswers: AIAnswerEntry[]
  isListening: boolean // true when call is active and mic is on
}

export function ChatThread({ transcripts, aiAnswers, isListening }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Merge and sort by timestamp
  const items: ChatItem[] = [
    ...transcripts.map((t) => ({ kind: 'transcript' as const, id: t.id, text: t.text, ts: t.ts })),
    ...aiAnswers.map((a) => ({ kind: 'ai_answer' as const, id: a.id, text: a.text, streaming: a.streaming, ts: a.ts })),
  ].sort((a, b) => a.ts - b.ts)

  // Track combined text length to re-scroll as AI tokens stream in
  const aiTextLength = aiAnswers.reduce((sum, a) => sum + a.text.length, 0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items.length, aiTextLength])

  if (items.length === 0) {
    return (
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
        <span style={{ fontSize: 32, lineHeight: 1 }}>🎙️</span>
        <span style={{ fontSize: 14 }}>Savolni gapirib boshlang…</span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflowY: 'auto',
        height: '100%',
        padding: '16px 16px 8px',
      }}
    >
      {items.map((item) =>
        item.kind === 'transcript' ? (
          <MijozBubble key={item.id} text={item.text} />
        ) : (
          <AIBubble key={item.id} text={item.text} streaming={item.streaming} />
        )
      )}

      {/* Listening indicator — shown while active but no new transcript yet */}
      {isListening && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, paddingRight: 4 }}>
            Mijoz
          </div>
          <div
            style={{
              maxWidth: '72%',
              padding: '10px 14px',
              borderRadius: '14px 14px 4px 14px',
              background: 'var(--transcript-mij-bg)',
              color: 'var(--transcript-mij-text)',
              fontSize: 14,
              animation: 'slide-in-top 240ms var(--ease-smooth) both',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--transcript-mij-text)',
                    opacity: 0.7,
                    animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }}
                />
              ))}
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mijoz (customer) bubble — right-aligned, uses existing transcript-mij vars
// ---------------------------------------------------------------------------
function MijozBubble({ text }: { text: string }) {
  const wrapStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginBottom: 10,
  }

  const metaStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 4,
    paddingRight: 4,
  }

  const bubbleStyle: React.CSSProperties = {
    maxWidth: '72%',
    padding: '10px 14px',
    borderRadius: '14px 14px 4px 14px',
    background: 'var(--transcript-mij-bg)',
    color: 'var(--transcript-mij-text)',
    fontSize: 14,
    lineHeight: 1.55,
    animation: 'slide-in-top 240ms var(--ease-smooth) both',
    wordBreak: 'break-word',
  }

  return (
    <div style={wrapStyle}>
      <div style={metaStyle}>Mijoz</div>
      <div style={bubbleStyle}>{text}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Operator bubble — left-aligned, uses transcript-op vars with AI glow accent
// ---------------------------------------------------------------------------
function AIBubble({ text, streaming }: { text: string; streaming?: boolean }) {
  const wrapStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 10,
  }

  const metaStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--ai-glow)',
    marginBottom: 4,
    paddingLeft: 4,
    fontWeight: 600,
  }

  const bubbleStyle: React.CSSProperties = {
    maxWidth: '72%',
    padding: '10px 14px',
    borderRadius: '14px 14px 14px 4px',
    background: 'var(--transcript-op-bg)',
    color: 'var(--transcript-op-text)',
    fontSize: 14,
    lineHeight: 1.55,
    animation: 'slide-in-top 240ms var(--ease-smooth) both',
    wordBreak: 'break-word',
    border: '1px solid var(--ai-glow-edge)',
  }

  return (
    <div style={wrapStyle}>
      <div style={metaStyle}>AI Operator</div>
      <div style={bubbleStyle}>
        {text}
        {streaming && (
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: '1em',
              background: 'var(--ai-glow)',
              marginLeft: 3,
              verticalAlign: 'text-bottom',
              animation: 'blink 1s step-end infinite',
            }}
          />
        )}
      </div>
    </div>
  )
}
