import { create } from 'zustand'

interface DemoModeState {
  enabled: boolean
  setEnabled: (v: boolean) => void
}

export const useDemoModeStore = create<DemoModeState>((set) => ({
  enabled: true,
  setEnabled: (enabled) => set({ enabled }),
}))
