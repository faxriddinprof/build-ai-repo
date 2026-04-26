/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        'bg-page': 'var(--bg-page)',
        'bg-canvas': 'var(--bg-canvas)',
        'border-subtle': 'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        'border-strong': 'var(--border-strong)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'sqb-blue-600': 'var(--sqb-blue-600)',
        'sqb-blue-500': 'var(--sqb-blue-500)',
        'sqb-blue-50': 'var(--sqb-blue-50)',
        'ai-glow': 'var(--ai-glow)',
        'success': 'var(--success)',
        'warning': 'var(--warning)',
        'danger': 'var(--danger)',
      },
    },
  },
  plugins: [],
}
