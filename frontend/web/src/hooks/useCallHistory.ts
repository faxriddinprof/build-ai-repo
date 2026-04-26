import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export interface CallHistoryItem {
  id: string
  customerName: string
  agentId: string
  duration: number
  sentiment: string
  outcome: string | null
  startedAt: string
  endedAt: string | null
  complianceScore: number
}

export function useCallHistory(filters: { outcome?: string; agentId?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['supervisor', 'history', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.outcome) params.set('outcome', filters.outcome)
      if (filters.agentId) params.set('agent_id', filters.agentId)
      if (filters.limit) params.set('limit', String(filters.limit))
      const res = await api.get<CallHistoryItem[]>(`/api/supervisor/history?${params}`)
      return res.data
    },
    refetchInterval: 10000,
  })
}
