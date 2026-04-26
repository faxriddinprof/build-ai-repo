export interface MiniWaveformProps {
  width?: number
  bars?: number
  color?: string
}

export function MiniWaveform({ width = 32, bars = 5, color = 'var(--ai-glow)' }: MiniWaveformProps) {
  const barWidth = Math.max(2, Math.floor((width - (bars - 1) * 2) / bars))
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        height: 20,
      }}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: barWidth,
            height: '100%',
            background: color,
            borderRadius: 2,
            transformOrigin: 'bottom',
            animation: `equalizer ${0.8 + i * 0.15}s ease-in-out ${i * 0.1}s infinite`,
          }}
        />
      ))}
    </span>
  )
}
