import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  theme: 'light' | 'dark'
  blueHue: number
  density: 'comfortable' | 'compact'
  setTheme: (t: 'light' | 'dark') => void
  setBlueHue: (h: number) => void
  setDensity: (d: 'comfortable' | 'compact') => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      blueHue: 220,
      density: 'comfortable',
      setTheme: (theme) => set({ theme }),
      setBlueHue: (blueHue) => set({ blueHue }),
      setDensity: (density) => set({ density }),
    }),
    {
      name: 'sqb_theme',
    },
  ),
)
