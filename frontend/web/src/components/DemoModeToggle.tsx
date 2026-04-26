import { useDemoModeStore } from '../store/demoModeStore'

export function DemoModeToggle() {
  const enabled = useDemoModeStore((s) => s.enabled)
  const setEnabled = useDemoModeStore((s) => s.setEnabled)

  return (
    <button
      onClick={() => setEnabled(!enabled)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 'var(--r-full)',
        background: enabled ? 'var(--ai-glow-soft)' : 'var(--surface-2)',
        border: enabled ? '1px solid var(--ai-glow-edge)' : '1px solid var(--border-subtle)',
        color: enabled ? 'var(--ai-glow)' : 'var(--text-muted)',
        fontWeight: 550,
        fontSize: 13,
        cursor: 'pointer',
        transition: 'background 200ms, border-color 200ms, color 200ms',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Toggle switch */}
      <span
        style={{
          position: 'relative',
          width: 28,
          height: 16,
          borderRadius: 8,
          background: enabled ? 'var(--ai-glow)' : 'var(--border-default)',
          transition: 'background 200ms',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: enabled ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 200ms var(--ease-smooth)',
          }}
        />
      </span>
      Demo rejimi
    </button>
  )
}
