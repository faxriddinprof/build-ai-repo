import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import api from '../lib/api'

export interface ActiveCall {
  id: string
  name: string
  agentId: string
  customerPhone: string
  customerRegion: string
  duration: number
  sentiment: 'positive' | 'neutral' | 'negative'
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

    ws.onmessage = () => {
      // Any supervisor event invalidates the active calls list
      qc.invalidateQueries({ queryKey: ['supervisor', 'active'] })
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
