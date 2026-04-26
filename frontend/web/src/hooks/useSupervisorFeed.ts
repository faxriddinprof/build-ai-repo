import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import api from '../lib/api'

export interface ActiveCall {
  id: string
  name: string
  agentId: string
  customerPhone: string | null
  customerRegion: string | null
  duration: number
  sentiment: 'positive' | 'neutral' | 'negative' | null
  topObjection: string | null
  startedAt: string
  active: boolean
  isHero: boolean
}

export function useSupervisorFeed() {
  const { data: activeCalls = [], isLoading } = useQuery({
    queryKey: ['supervisor', 'active'],
    queryFn: async () => {
      const res = await api.get<ActiveCall[]>('/api/supervisor/active')
      return res.data
    },
    refetchInterval: 5000,
  })

  const qc = useQueryClient()
  const accessToken = useAuthStore((s) => s.accessToken)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!accessToken) return
    const wsUrl =
      (location.protocol === 'https:' ? 'wss:' : 'ws:') +
      '//' +
      location.host +
      '/ws/supervisor?token=' +
      accessToken

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as { type: string } & Partial<ActiveCall>
        if (event.type === 'active_call' && event.id) {
          // Patch the specific call in cache — no HTTP round-trip needed
          qc.setQueryData<ActiveCall[]>(['supervisor', 'active'], (prev = []) => {
            const incoming = event as ActiveCall
            const idx = prev.findIndex((c) => c.id === incoming.id)
            if (idx === -1) return [...prev, incoming]
            const next = [...prev]
            next[idx] = incoming
            return next
          })
        } else {
          // Structural change (call started/ended, queue events) — refetch
          qc.invalidateQueries({ queryKey: ['supervisor', 'active'] })
        }
      } catch {
        // ignore malformed
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    return () => {
      ws.close()
    }
  }, [accessToken, qc])

  return { activeCalls, isLoading }
}
