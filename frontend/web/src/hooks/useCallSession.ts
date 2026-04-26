import { useReducer, useRef, useCallback, useEffect } from 'react'
import { sessionReducer, initialSessionState } from './useSessionReducer'
import { useAuthStore } from '../store/authStore'
import api from '../lib/api'
import type {
  CallSessionApi,
  ConfirmIntakeData,
  IntakeProposal,
  TranscriptEntry,
  SuggestionEntry,
  Sentiment,
} from '../types/session'

// ---------------------------------------------------------------------------
// Backend event shapes (raw from DataChannel or REST response)
// ---------------------------------------------------------------------------
interface RawEvent {
  type: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useCallSession(): CallSessionApi {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState)
  const accessToken = useAuthStore((s) => s.accessToken)

  // All heavy refs — no re-renders
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const iceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callTimeRef = useRef(0)
  const callIdRef = useRef<string | null>(null)
  const usingRestFallbackRef = useRef(false)

  // -------------------------------------------------------------------------
  // Tick — 1 second
  // -------------------------------------------------------------------------
  const startTick = useCallback(() => {
    if (tickIntervalRef.current !== null) return
    tickIntervalRef.current = setInterval(() => {
      callTimeRef.current += 1
      dispatch({ type: 'TICK', callTime: callTimeRef.current })
    }, 1000)
  }, [])

  const stopTick = useCallback(() => {
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }
  }, [])

  // -------------------------------------------------------------------------
  // Map raw backend events to SessionActions
  // -------------------------------------------------------------------------
  const handleRawEvent = useCallback(
    (evt: RawEvent) => {
      switch (evt.type) {
        case 'call_started': {
          const callId = (evt.call_id as string | undefined) ?? callIdRef.current ?? ''
          dispatch({ type: 'CALL_STARTED', callId })
          startTick()
          break
        }
        case 'transcript': {
          const entry: TranscriptEntry = {
            id: crypto.randomUUID(),
            speaker: (evt.speaker as TranscriptEntry['speaker']) ?? 'customer',
            text: (evt.text as string) ?? '',
            ts: callTimeRef.current,
          }
          dispatch({ type: 'TRANSCRIPT', entry })
          break
        }
        case 'suggestion': {
          const rawBullets = evt.text as string[] | undefined
          const bullets = (rawBullets ?? []).map((b) => b.replace(/^[•\s\-–]+/, '').trim())
          const entry: SuggestionEntry = {
            id: crypto.randomUUID(),
            trigger: (evt.trigger as string) ?? '',
            bullets,
            arrivedAt: callTimeRef.current,
          }
          dispatch({ type: 'SUGGESTION', entry })
          break
        }
        case 'sentiment':
          dispatch({ type: 'SENTIMENT', sentiment: (evt.sentiment as Sentiment) ?? 'neutral' })
          break
        case 'compliance_tick':
          dispatch({ type: 'COMPLIANCE_TICK', phraseId: (evt.phrase_id as string) ?? '' })
          break
        case 'intake_proposal': {
          const proposal: IntakeProposal = {
            customerName: (evt.customer_name as string) ?? '',
            customerPassport: (evt.customer_passport as string) ?? '',
            customerRegion: (evt.customer_region as string) ?? '',
            confidence: (evt.confidence as number) ?? 0,
          }
          dispatch({ type: 'INTAKE_PROPOSAL', proposal })
          break
        }
        case 'summary_ready':
          stopTick()
          dispatch({
            type: 'SUMMARY_READY',
            summary: {
              outcome: evt.outcome as string | undefined,
              objections: evt.objections as string[] | undefined,
              nextAction: evt.next_action as string | undefined,
            },
          })
          break
        case 'error':
          dispatch({ type: 'ERROR', message: (evt.message as string) ?? 'Unknown error' })
          break
        default:
          break
      }
    },
    [startTick, stopTick],
  )

  // -------------------------------------------------------------------------
  // REST fallback — MediaRecorder chunks
  // -------------------------------------------------------------------------
  const startRestFallback = useCallback(
    (stream: MediaStream, callId: string) => {
      usingRestFallbackRef.current = true
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      // WebM timesliced chunks after the first lack the EBML/track init
      // segment, so ffmpeg can't decode them standalone. We prepend the
      // saved first chunk (which contains the init segment) to every
      // subsequent chunk before sending.
      let initChunk: Blob | null = null

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return
        let sendBlob: Blob
        if (!initChunk) {
          initChunk = e.data
          sendBlob = e.data
        } else {
          sendBlob = new Blob([initChunk, e.data], { type: mimeType })
        }
        const form = new FormData()
        form.append('audio', sendBlob, 'chunk.webm')
        form.append('call_id', callId)
        form.append('lang_hint', 'uz')
        try {
          const res = await api.post<{ events: RawEvent[] }>('/api/transcribe-chunk', form)
          ;(res.data.events ?? []).forEach(handleRawEvent)
        } catch {
          // non-fatal — keep recording
        }
      }

      recorder.start(2000) // 2 s chunks
    },
    [handleRawEvent],
  )

  // Minimal 44-byte WAV (0 samples) — satisfies the backend's required
  // audio field when we only need to signal final=true for summary.
  const silentWav = (): Blob => {
    const buf = new ArrayBuffer(44)
    const v = new DataView(buf)
    const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); v.setUint32(4, 36, true); str(8, 'WAVE')
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
    v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true)
    v.setUint16(32, 2, true); v.setUint16(34, 16, true)
    str(36, 'data'); v.setUint32(40, 0, true)
    return new Blob([buf], { type: 'audio/wav' })
  }

  // -------------------------------------------------------------------------
  // Switch to REST fallback on ICE failure
  // -------------------------------------------------------------------------
  const switchToRestFallback = useCallback(() => {
    if (usingRestFallbackRef.current) return
    if (!streamRef.current || !callIdRef.current) return

    // Clean up WebRTC resources but keep stream
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

    startRestFallback(streamRef.current, callIdRef.current)
  }, [startRestFallback])

  // -------------------------------------------------------------------------
  // Teardown all resources
  // -------------------------------------------------------------------------
  const teardown = useCallback(() => {
    stopTick()
    if (iceTimeoutRef.current !== null) {
      clearTimeout(iceTimeoutRef.current)
      iceTimeoutRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
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
    usingRestFallbackRef.current = false
  }, [stopTick])

  // Unmount cleanup
  useEffect(() => {
    return () => {
      teardown()
    }
  }, [teardown])

  // -------------------------------------------------------------------------
  // start()
  // -------------------------------------------------------------------------
  const start = useCallback(
    async (callId: string) => {
      callIdRef.current = callId
      callTimeRef.current = 0
      dispatch({ type: 'RESET' })
      dispatch({ type: 'CALL_STARTED', callId })
      startTick()

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
      } catch {
        dispatch({ type: 'ERROR', message: 'Mikrofonga ruxsat berilmadi' })
        // Fall back to REST without mic (nothing to record)
        return
      }

      // Try WebRTC
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        })
        pcRef.current = pc

        const dc = pc.createDataChannel('transcripts')
        dcRef.current = dc

        stream.getTracks().forEach((track) => pc.addTrack(track, stream))

        const wsUrl =
          (location.protocol === 'https:' ? 'wss:' : 'ws:') +
          '//' +
          location.host +
          '/ws/signaling?token=' +
          (accessToken ?? '')
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = async () => {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }))
        }

        ws.onmessage = async (msg: MessageEvent<string>) => {
          const data = JSON.parse(msg.data) as { type: string; sdp?: string; candidate?: RTCIceCandidateInit }
          if (data.type === 'answer' && data.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }))
          } else if (data.type === 'ice-candidate' && data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          }
        }

        ws.onerror = () => {
          switchToRestFallback()
        }

        pc.onicecandidate = (e) => {
          if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate.toJSON() }))
          }
        }

        pc.oniceconnectionstatechange = () => {
          const s = pc.iceConnectionState
          if (s === 'connected' || s === 'completed') {
            if (iceTimeoutRef.current !== null) {
              clearTimeout(iceTimeoutRef.current)
              iceTimeoutRef.current = null
            }
          } else if (s === 'failed' || s === 'disconnected') {
            if (iceTimeoutRef.current === null) {
              iceTimeoutRef.current = setTimeout(() => {
                switchToRestFallback()
              }, 5000)
            }
          }
        }

        dc.onopen = () => {
          dc.send(JSON.stringify({ type: 'start_call', call_id: callId, language_hint: 'uz' }))
        }

        dc.onmessage = (e: MessageEvent<string>) => {
          try {
            const evt = JSON.parse(e.data) as RawEvent
            handleRawEvent(evt)
          } catch {
            // ignore malformed
          }
        }
      } catch {
        // WebRTC setup failed — go straight to REST
        switchToRestFallback()
      }
    },
    [accessToken, handleRawEvent, startTick, switchToRestFallback],
  )

  // -------------------------------------------------------------------------
  // endCall()
  // -------------------------------------------------------------------------
  const endCall = useCallback(async () => {
    const callId = callIdRef.current
    if (!callId) return

    if (usingRestFallbackRef.current) {
      // Request final chunk then POST with final=true
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.requestData()
        mediaRecorderRef.current.stop()

        await new Promise<void>((resolve) => {
          const rec = mediaRecorderRef.current
          if (!rec) { resolve(); return }
          rec.onstop = async () => {
            const form = new FormData()
            form.append('audio', silentWav(), 'final.wav')
            form.append('call_id', callId)
            form.append('lang_hint', 'uz')
            form.append('final', 'true')
            try {
              const res = await api.post<{ events: RawEvent[] }>('/api/transcribe-chunk', form)
              ;(res.data.events ?? []).forEach(handleRawEvent)
            } catch {
              // ignore
            }
            resolve()
          }
        })
      }
    } else {
      // WebRTC path
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({ type: 'end_call' }))
      }
    }

    // Signal backend to end call
    try {
      await api.post(`/api/calls/${callId}/end`)
    } catch {
      // ignore
    }

    teardown()
    stopTick()
  }, [handleRawEvent, stopTick, teardown])

  // -------------------------------------------------------------------------
  // confirmIntake()
  // -------------------------------------------------------------------------
  const confirmIntake = useCallback(
    async (data: ConfirmIntakeData) => {
      const callId = callIdRef.current
      if (callId) {
        try {
          await api.patch(`/api/calls/${callId}/intake`, {
            customer_name: data.customer_name,
            customer_passport: data.customer_passport,
            customer_region: data.customer_region,
          })
        } catch {
          // ignore
        }
      }
      dispatch({ type: 'INTAKE_CONFIRMED' })
    },
    [],
  )

  // -------------------------------------------------------------------------
  // dismissIntake()
  // -------------------------------------------------------------------------
  const dismissIntake = useCallback(() => {
    dispatch({ type: 'INTAKE_DISMISSED' })
  }, [])

  // -------------------------------------------------------------------------
  // reset()
  // -------------------------------------------------------------------------
  const reset = useCallback(() => {
    teardown()
    callIdRef.current = null
    callTimeRef.current = 0
    usingRestFallbackRef.current = false
    dispatch({ type: 'RESET' })
  }, [teardown])

  return {
    ...state,
    start,
    endCall,
    confirmIntake,
    dismissIntake,
    reset,
  }
}
