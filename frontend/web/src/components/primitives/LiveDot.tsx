export interface LiveDotProps {
  color?: string
  size?: number
}

export function LiveDot({ color = 'var(--ai-glow)', size = 8 }: LiveDotProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 0 ${size * 0.6}px ${color}33`,
        animation: 'pulse-dot 1.4s ease-in-out infinite',
        flexShrink: 0,
      }}
    />
  )
}
