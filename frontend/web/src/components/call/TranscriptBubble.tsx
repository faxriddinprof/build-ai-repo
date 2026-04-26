import type React from 'react'

export interface TranscriptBubbleProps {
  speaker: string
  text: string
  time: string
  streaming?: boolean
}

const isOperator = (speaker: string) =>
  speaker === 'Operator' || speaker === 'agent'

export function TranscriptBubble({ speaker, text, time, streaming }: TranscriptBubbleProps) {
  const op = isOperator(speaker)

  const bubbleStyle: React.CSSProperties = {
    maxWidth: '72%',
    padding: '10px 14px',
    borderRadius: op ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
    background: op ? 'var(--transcript-op-bg)' : 'var(--transcript-mij-bg)',
    color: op ? 'var(--transcript-op-text)' : 'var(--transcript-mij-text)',
    fontSize: 14,
    lineHeight: 1.55,
    animation: 'slide-in-top 240ms var(--ease-smooth) both',
    wordBreak: 'break-word',
  }

  const wrapStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: op ? 'flex-end' : 'flex-start',
    marginBottom: 10,
  }

  const metaStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 4,
    paddingLeft: op ? 0 : 4,
    paddingRight: op ? 4 : 0,
  }

  return (
    <div style={wrapStyle}>
      <div style={metaStyle}>
        {speaker === 'Operator' || speaker === 'agent' ? 'Operator' : 'Mijoz'} · {time}
      </div>
      <div style={bubbleStyle}>
        {text}
        {streaming && (
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: '1em',
              background: 'currentColor',
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
