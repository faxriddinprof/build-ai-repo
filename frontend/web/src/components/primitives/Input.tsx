import type React from 'react'
import { useState } from 'react'
import { Icon } from '../Icon'

export interface InputProps {
  label?: string
  type?: string
  icon?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  helper?: string
  error?: string
  autoComplete?: string
}

export function Input({ label, type = 'text', icon, value, onChange, placeholder, helper, error, autoComplete }: InputProps) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label
          style={{
            fontSize: 13,
            fontWeight: 550,
            color: 'var(--text-secondary)',
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--surface-1)',
          border: `1px solid ${error ? 'var(--danger)' : focused ? 'var(--sqb-blue-600)' : 'var(--border-default)'}`,
          borderRadius: 'var(--r-md)',
          boxShadow: focused ? '0 0 0 3px var(--sqb-blue-50)' : 'none',
          transition: 'all 120ms var(--ease-smooth)',
          height: 44,
        }}
      >
        {icon && (
          <span style={{ paddingLeft: 12, color: 'var(--text-muted)', display: 'inline-flex' }}>
            <Icon name={icon} size={16} />
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            padding: '0 12px',
            fontSize: 14,
            background: 'transparent',
            color: 'var(--text-primary)',
            height: '100%',
          }}
        />
      </div>
      {helper && !error && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{helper}</span>}
      {error && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}
