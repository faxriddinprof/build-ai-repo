import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDemoModeStore } from '../store/demoModeStore'
import api from '../lib/api'
import { CALL_QUEUE } from '../data/demoTimeline'
import type { QueueEntry } from '../data/demoTimeline'

interface AcceptResult {
  callId: string
}

interface UseQueueReturn {
  queue: QueueEntry[]
  isLoading: boolean
  accept: (queueId: string) => Promise<AcceptResult>
  skip: (queueId: string, reason: string, note?: string) => Promise<void>
}

export function useQueue(): UseQueueReturn {
  const demoEnabled = useDemoModeStore((s) => s.enabled)

  // Demo queue state (local mutation for skip)
  const [demoQueue, setDemoQueue] = useState<QueueEntry[]>(CALL_QUEUE)

  const { data: realQueue, isLoading } = useQuery<QueueEntry[]>({
    queryKey: ['queue'],
    queryFn: async () => {
      const res = await api.get<QueueEntry[]>('/api/queue')
      return res.data
    },
    refetchInterval: 5000,
    enabled: !demoEnabled,
  })

  const accept = useCallback(
    async (queueId: string): Promise<AcceptResult> => {
      if (demoEnabled) {
        return { callId: 'demo-' + crypto.randomUUID() }
      }
      const res = await api.post<{ id: string }>(`/api/queue/${queueId}/accept`)
      return { callId: res.data.id }
    },
    [demoEnabled],
  )

  const skip = useCallback(
    async (queueId: string, reason: string, note?: string): Promise<void> => {
      if (demoEnabled) {
        setDemoQueue((prev) => prev.filter((q) => q.id !== queueId))
        return
      }
      await api.post(`/api/queue/${queueId}/skip`, { reason, note })
    },
    [demoEnabled],
  )

  if (demoEnabled) {
    return { queue: demoQueue, isLoading: false, accept, skip }
  }

  return {
    queue: realQueue ?? [],
    isLoading,
    accept,
    skip,
  }
}
