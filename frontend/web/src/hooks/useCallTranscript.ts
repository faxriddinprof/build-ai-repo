import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { TranscriptEntry } from '../types/session'

export function useCallTranscript(callId: string | null) {
  return useQuery({
    queryKey: ['supervisor', 'transcript', callId],
    queryFn: async () => {
      const res = await api.get<TranscriptEntry[]>(`/api/supervisor/calls/${callId}/transcript`)
      return res.data
    },
    enabled: !!callId,
    refetchInterval: 3000,
  })
}
