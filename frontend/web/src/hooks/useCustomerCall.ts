import { useState, useRef, useCallback, useEffect } from 'react'

export interface CustomerCallState {
  phase: 'loading' | 'idle' | 'ringing' | 'active' | 'ended' | 'error'
  displayName: string
  maskedPhone: string | null
  operatorName: string | null
  callTime: number
  waitTime: number
  error: string | null
  remoteStream: MediaStream | null
  start: () => void
  endCall: () => void
}

interface CustomerInitResponse {
  display_name: string
  masked_phone: string
  region: string
  ice_servers: RTCIceServer[]
  customer_token: string
  queue_id: string
}

interface StatusResponse {
  status: 'pending' | 'accepted' | 'skipped' | 'expired'
  queue_id: string
  operator?: string
  ice_servers?: RTCIceServer[]
}

interface RawSignalingMessage {
  type: string
  sdp?: string
  candidate?: RTCIceCandidateInit
  call_id?: string
  [key: string]: unknown
}

export function useCustomerCall(clientId: string): CustomerCallState {
  const [phase, setPhase] = useState<CustomerCallState['phase']>('loading')
  const [displayName, setDisplayName] = useState('')
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null)
  const [operatorName, setOperatorName] = useState<string | null>(null)
  const [callTime, setCallTime] = useState(0)
  const [waitTime, setWaitTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  // Refs — no re-renders needed
  const customerTokenRef = useRef<string | null>(null)
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }])

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const waitTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const waitTimeRef = useRef(0)
  const callTimeRef = useRef(0)

  // ---------------------------------------------------------------------------
  // Ticker helpers
  // ---------------------------------------------------------------------------
  const startWaitTick = useCallback(() => {
    if (waitTickRef.current !== null) return
    waitTimeRef.current = 0
    setWaitTime(0)
    waitTickRef.current = setInterval(() => {
      waitTimeRef.current += 1
      setWaitTime(waitTimeRef.current)
    }, 1000)
  }, [])

  const stopWaitTick = useCallback(() => {
    if (waitTickRef.current !== null) {
      clearInterval(waitTickRef.current)
      waitTickRef.current = null
    }
  }, [])

  const startCallTick = useCallback(() => {
    if (callTickRef.current !== null) return
    callTimeRef.current = 0
    setCallTime(0)
    callTickRef.current = setInterval(() => {
      callTimeRef.current += 1
      setCallTime(callTimeRef.current)
    }, 1000)
  }, [])

  const stopCallTick = useCallback(() => {
    if (callTickRef.current !== null) {
      clearInterval(callTickRef.current)
      callTickRef.current = null
    }
  }, [])

  const stopPoll = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Teardown all resources
  // ---------------------------------------------------------------------------
  const teardown = useCallback(() => {
    stopWaitTick()
    stopCallTick()
    stopPoll()

    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [stopWaitTick, stopCallTick, stopPoll])

  // ---------------------------------------------------------------------------
  // startWebRTC — called when status becomes 'accepted'
  // ---------------------------------------------------------------------------
  const startWebRTC = useCallback(
    async (iceServers: RTCIceServer[]) => {
      const token = customerTokenRef.current
      if (!token) return

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
      } catch {
        setPhase('error')
        setError('Mikrofonga ruxsat berilmadi')
        return
      }

      try {
        const pc = new RTCPeerConnection({ iceServers })
        pcRef.current = pc

        // Outgoing audio track
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))

        // Incoming remote audio
        pc.ontrack = (e) => {
          const remote = e.streams[0] ?? new MediaStream([e.track])
          setRemoteStream(remote)
        }

        const dc = pc.createDataChannel('transcripts')
        dcRef.current = dc

        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${wsProtocol}//${location.host}/ws/signaling?token=${token}`
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = async () => {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }))
        }

        ws.onmessage = async (msg: MessageEvent<string>) => {
          const data = JSON.parse(msg.data) as RawSignalingMessage
          if (data.type === 'answer' && data.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }))
          } else if (data.type === 'ice-candidate' && data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          }
        }

        ws.onerror = () => {
          setPhase('error')
          setError('Ulanish uzildi')
          teardown()
        }

        pc.onicecandidate = (e) => {
          if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate.toJSON() }))
          }
        }

        pc.oniceconnectionstatechange = () => {
          const s = pc.iceConnectionState
          if (s === 'failed' || s === 'disconnected') {
            setPhase('error')
            setError('Ulanish uzildi')
            teardown()
          }
        }

        dc.onopen = () => {
          dc.send(JSON.stringify({ type: 'start_call', language_hint: 'uz' }))
        }

        dc.onmessage = (e: MessageEvent<string>) => {
          try {
            const evt = JSON.parse(e.data) as { type: string; [key: string]: unknown }
            if (evt.type === 'call_started') {
              setPhase('active')
              startCallTick()
            }
          } catch {
            // ignore malformed
          }
        }
      } catch {
        setPhase('error')
        setError('Ulanish uzildi')
        teardown()
      }
    },
    [startCallTick, teardown],
  )

  // ---------------------------------------------------------------------------
  // start() — user tapped the button
  // ---------------------------------------------------------------------------
  const start = useCallback(() => {
    if (phase !== 'idle') return

    setPhase('ringing')
    startWaitTick()

    const token = customerTokenRef.current
    if (!token) {
      setPhase('error')
      setError("Ma'lumot yuklanmadi")
      return
    }

    // Poll status every 1 second
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/customer/call/${token}/status`)
        if (!res.ok) return
        const data = (await res.json()) as StatusResponse

        if (data.status === 'accepted') {
          stopPoll()
          stopWaitTick()
          if (data.operator) setOperatorName(data.operator)
          const servers = data.ice_servers ?? iceServersRef.current
          await startWebRTC(servers)
        } else if (data.status === 'skipped' || data.status === 'expired') {
          stopPoll()
          stopWaitTick()
          setPhase('error')
          setError("Qo'ng'iroq rad etildi")
        }
      } catch {
        // keep polling on network errors
      }
    }, 1000)
  }, [phase, startWaitTick, stopPoll, stopWaitTick, startWebRTC])

  // ---------------------------------------------------------------------------
  // endCall()
  // ---------------------------------------------------------------------------
  const endCall = useCallback(() => {
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'end_call' }))
    }
    teardown()
    setPhase('ended')
  }, [teardown])

  // ---------------------------------------------------------------------------
  // Load customer info on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!clientId) {
      setPhase('error')
      setError("Mijoz topilmadi")
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/customer/${clientId}/call`)
        if (!res.ok) throw new Error('Not found')
        const data = (await res.json()) as CustomerInitResponse
        if (cancelled) return

        customerTokenRef.current = data.customer_token
        if (data.ice_servers?.length) iceServersRef.current = data.ice_servers
        setDisplayName(data.display_name ?? '')
        setMaskedPhone(data.masked_phone ?? null)
        setPhase('idle')
      } catch {
        if (!cancelled) {
          setPhase('error')
          setError("Ma'lumot yuklanmadi")
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      teardown()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  return {
    phase,
    displayName,
    maskedPhone,
    operatorName,
    callTime,
    waitTime,
    error,
    remoteStream,
    start,
    endCall,
  }
}
