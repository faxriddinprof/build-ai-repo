import { useEffect, useState } from 'react'
import api from '../lib/api'

export interface DemoClient {
  client_id: string
  display_name: string
  region: string
  risk_category: 'low' | 'medium' | 'high'
  has_loan: boolean
  has_deposit: boolean
}

export function useDemoClients() {
  const [clients, setClients] = useState<DemoClient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ clients: DemoClient[] }>('/api/clients/demo')
      .then((r) => setClients(r.data.clients))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { clients, loading }
}
