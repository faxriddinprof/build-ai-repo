import { useMemo } from 'react'

export interface AvatarProps {
  name: string
  size?: number
  color?: string
}

export function Avatar({ name, size = 32, color }: AvatarProps) {
  const initials = useMemo(() => {
    if (!name) return '?'
    const parts = name.split(' ').filter(Boolean)
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  }, [name])

  const colors = ['#0B3D91', '#1E5BD8', '#7C3AED', '#0891B2', '#059669', '#CA8A04', '#DC2626']

  const hash = useMemo(() => {
    let h = 0
    const str = name || ''
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0
    }
    return h
  }, [name])

  const bg = color || colors[hash % colors.length]

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: 'white',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 600,
        flexShrink: 0,
        letterSpacing: '0.01em',
      }}
    >
      {initials}
    </div>
  )
}
