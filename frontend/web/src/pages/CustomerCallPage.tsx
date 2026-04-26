import { useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useCustomerCall } from '../hooks/useCustomerCall'
import { CallButton } from '../components/call/CallButton'
import { Logo } from '../components/primitives/Logo'
import { LiveDot } from '../components/primitives/LiveDot'
import { Icon } from '../components/Icon'
import { fmtTime } from '../lib/format'

export default function CustomerCallPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const {
    phase,
    displayName,
    maskedPhone,
    operatorName,
    callTime,
    waitTime,
    error,
    remoteStream,
    start,
    endCall,
  } = useCustomerCall(clientId ?? '')

  const audioRef = useRef<HTMLAudioElement>(null)

  // Wire remote audio stream to the hidden audio element
  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // Greeting text by phase
  const headingText = (() => {
    switch (phase) {
      case 'loading':
        return 'Yuklanmoqda…'
      case 'ended':
        return "Qo'ng'iroq yakunlandi"
      case 'error':
        return "Xatolik yuz berdi"
      default:
        return 'SQB bankka xush kelibsiz'
    }
  })()

  const subtitleText = (() => {
    switch (phase) {
      case 'loading':
        return null
      case 'idle':
        return "Operator bilan bog'lanish uchun tugmani bosing"
      case 'ringing':
        return 'Operator qidirilmoqda…'
      case 'active':
        return 'Operator bilan suhbatlashayapsiz'
      case 'ended':
        return 'Suhbat uchun rahmat!'
      case 'error':
        return error ?? "Noma'lum xatolik"
      default:
        return null
    }
  })()

  // Map phase to CallButton state
  const buttonState = (() => {
    switch (phase) {
      case 'ringing':
        return 'ringing' as const
      case 'active':
        return 'active' as const
      case 'ended':
        return 'ended' as const
      default:
        return 'idle' as const
    }
  })()

  const isButtonDisabled = phase === 'loading' || phase === 'active' || phase === 'ended' || phase === 'error'

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background:
          'radial-gradient(ellipse at 50% 30%, var(--sqb-blue-50) 0%, transparent 55%), var(--bg-page)',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-glass)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Logo size={28} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--success)',
            fontWeight: 550,
          }}
        >
          <Icon name="shield" size={14} />
          <span>Xavfsiz ulanish</span>
        </div>
      </header>

      {/* Main */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
          padding: '48px 24px',
        }}
      >
        {/* Greeting */}
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          {phase === 'idle' && displayName && (
            <p
              style={{
                fontSize: 15,
                color: 'var(--sqb-blue-600)',
                fontWeight: 550,
                marginBottom: -16,
                margin: '0 0 16px',
              }}
            >
              Salom, {displayName}!
            </p>
          )}
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 10px',
              lineHeight: 1.2,
            }}
          >
            {headingText}
          </h1>
          {subtitleText && phase !== 'error' && (
            <p
              style={{
                fontSize: 16,
                color: 'var(--text-secondary)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {subtitleText}
            </p>
          )}
          {maskedPhone && (phase === 'idle' || phase === 'ringing') && (
            <p
              style={{
                fontSize: 14,
                color: 'var(--text-muted)',
                margin: '6px 0 0',
              }}
            >
              {maskedPhone}
            </p>
          )}
        </div>

        {/* Call Button */}
        <CallButton
          size="hero"
          state={buttonState}
          onClick={phase === 'idle' ? start : undefined}
          disabled={isButtonDisabled}
        />

        {/* Status area */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            minHeight: 80,
          }}
        >
          {phase === 'loading' && (
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Yuklanmoqda…</p>
          )}

          {phase === 'idle' && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 'var(--r-full)',
                background: 'var(--success-bg)',
                color: 'var(--success)',
                fontSize: 13,
                fontWeight: 550,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--success)',
                  display: 'inline-block',
                }}
              />
              6 ta operator onlayn
            </div>
          )}

          {phase === 'ringing' && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: 'var(--warning)',
                fontWeight: 500,
              }}
            >
              <LiveDot color="var(--warning)" size={8} />
              <span>Operator kutilmoqda… {fmtTime(waitTime)}</span>
            </div>
          )}

          {phase === 'active' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: 'var(--success)',
                  fontWeight: 550,
                }}
              >
                <LiveDot color="var(--success)" size={8} />
                <span>Operator ulandi · {operatorName ?? 'Diyora S.'}</span>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  letterSpacing: '0.08em',
                }}
              >
                {fmtTime(callTime)}
              </span>
              <button
                onClick={endCall}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '10px 20px',
                  borderRadius: 'var(--r-full)',
                  background: 'var(--danger)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                <Icon name="phone-off" size={16} />
                <span>Qo'ng'iroqni yakunlash</span>
              </button>
            </div>
          )}

          {phase === 'ended' && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: 'var(--success)',
                fontWeight: 500,
              }}
            >
              <Icon name="check" size={16} style={{ color: 'var(--success)' }} />
              <span>Suhbat yakunlandi. Vaqtingiz uchun rahmat!</span>
            </div>
          )}

          {phase === 'error' && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: 'var(--danger)',
                fontWeight: 500,
              }}
            >
              <Icon name="alert" size={16} style={{ color: 'var(--danger)' }} />
              <span>{error ?? "Noma'lum xatolik"}</span>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: '16px 32px',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        Qo'ng'iroq xavfsiz va bepul · Ish vaqti 9:00–21:00
      </footer>

      {/* Hidden audio element for remote stream */}
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
    </div>
  )
}
