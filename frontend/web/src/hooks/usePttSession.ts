import { useCallback, useReducer, useRef, useState } from 'react'
import { sessionReducer, initialSessionState } from './useSessionReducer'
import api from '../lib/api'
import type { TranscriptEntry, SuggestionEntry, Sentiment } from '../types/session'

export type PttStatus = 'idle' | 'call_active' | 'recording' | 'sending' | 'ended'

export function usePttSession() {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState)
  const [pttStatus, setPttStatus] = useState<PttStatus>('idle')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const callIdRef = useRef<string | null>(null)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callTimeRef = useRef(0)

  // -------------------------------------------------------------------------
  // Timer tick
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
  // Event handler — maps raw backend events to session actions
  // -------------------------------------------------------------------------
  const handleEvent = useCallback((ev: Record<string, unknown>) => {
    switch (ev.type) {
      case 'transcript': {
        const entry: TranscriptEntry = {
          id: crypto.randomUUID(),
          speaker: 'customer', // self-talk: mic is always the customer
          text: String(ev.text ?? ''),
          ts: callTimeRef.current,
        }
        dispatch({ type: 'TRANSCRIPT', entry })
        break
      }
      case 'suggestion': {
        const rawBullets = ev.text as string[] | undefined
        const bullets = (rawBullets ?? []).map((b) => b.replace(/^[•\s\-–]+/, '').trim())
        const entry: SuggestionEntry = {
          id: crypto.randomUUID(),
          trigger: String(ev.trigger ?? ''),
          bullets,
          arrivedAt: callTimeRef.current,
        }
        dispatch({ type: 'SUGGESTION', entry })
        break
      }
      case 'ai_answer': {
        const messageId = String(ev.message_id ?? '')
        const text = String(ev.text ?? '')
        const done = Boolean(ev.done)
        if (text) {
          dispatch({ type: 'AI_ANSWER_DELTA', messageId, delta: text, ts: callTimeRef.current })
        }
        if (done) {
          dispatch({ type: 'AI_ANSWER_DONE', messageId })
        }
        break
      }
      case 'sentiment':
        dispatch({ type: 'SENTIMENT', sentiment: (ev.sentiment as Sentiment) ?? 'neutral' })
        break
      case 'compliance_tick':
        dispatch({ type: 'COMPLIANCE_TICK', phraseId: String(ev.phrase_id ?? ev.phraseId ?? '') })
        break
      case 'summary_ready': {
        stopTick()
        // Backend nests all fields under ev.summary; fall back to top-level for compatibility
        const s = (ev.summary ?? ev) as Record<string, unknown>
        dispatch({
          type: 'SUMMARY_READY',
          summary: {
            outcome: (s.outcome ?? s.natija) as string | undefined,
            objections: (s.objections ?? s.etirozlar) as string[] | undefined,
            nextAction: (s.next_action ?? s.keyingiQadam) as string | undefined,
            natija: s.natija as string | undefined,
            etirozlar: s.etirozlar as string[] | undefined,
            keyingiQadam: s.keyingiQadam as string | undefined,
            complianceHolati: s.complianceHolati as { passed: number; total: number } | undefined,
            sentiment: s.sentiment as string | undefined,
          },
        })
        break
      }
      case 'error':
        dispatch({ type: 'ERROR', message: String(ev.message ?? 'Unknown error') })
        break
      default:
        break
    }
  }, [stopTick])

  // -------------------------------------------------------------------------
  // startCall — create call record and acquire mic
  // -------------------------------------------------------------------------
  const startCall = useCallback(async (clientId: string | null) => {
    try {
      callTimeRef.current = 0
      dispatch({ type: 'RESET' })
      const res = await api.post<{ id: string }>('/api/calls', { client_id: clientId })
      callIdRef.current = res.data.id
      dispatch({ type: 'CALL_STARTED', callId: res.data.id })
      startTick()
      // Acquire mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      // Keep mic muted until user clicks Gapirish
      stream.getAudioTracks().forEach((t) => (t.enabled = false))
      setPttStatus('call_active')
    } catch (err) {
      dispatch({ type: 'ERROR', message: String(err) })
    }
  }, [dispatch, startTick])

  // -------------------------------------------------------------------------
  // startSpeaking — unmute mic and begin recording
  // -------------------------------------------------------------------------
  const startSpeaking = useCallback(() => {
    if (!streamRef.current || pttStatus !== 'call_active') return
    chunksRef.current = []
    // Enable mic
    streamRef.current.getAudioTracks().forEach((t) => (t.enabled = true))
    // Prefer opus webm
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start(100) // 100ms timeslices
    mediaRecorderRef.current = recorder
    setPttStatus('recording')
  }, [pttStatus])

  // -------------------------------------------------------------------------
  // stopAndSendChunk — stop recorder, send audio, await events
  // -------------------------------------------------------------------------
  const stopAndSendChunk = useCallback(async () => {
    if (!mediaRecorderRef.current || pttStatus !== 'recording') return
    setPttStatus('sending')
    // Mute mic immediately
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false))

    // Stop recorder and collect final data
    await new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = () => resolve()
      mediaRecorderRef.current!.stop()
    })

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []

    try {
      const form = new FormData()
      form.append('audio', blob, 'chunk.webm')
      form.append('call_id', callIdRef.current ?? '')
      form.append('lang_hint', 'uz')
      form.append('final', 'false')

      const res = await api.post<{ events: Array<Record<string, unknown>> }>(
        '/api/transcribe-chunk',
        form,
      )
      for (const ev of res.data.events ?? []) {
        handleEvent(ev)
      }
    } catch (err) {
      dispatch({ type: 'ERROR', message: String(err) })
    }
    setPttStatus('call_active')
  }, [pttStatus, dispatch, handleEvent])

  // -------------------------------------------------------------------------
  // endCall — send final chunk, clean up
  // -------------------------------------------------------------------------
  const endCall = useCallback(async () => {
    if (!callIdRef.current) return
    try {
      const form = new FormData()
      // Minimal 44-byte WAV (0 samples)
      const buf = new ArrayBuffer(44)
      const v = new DataView(buf)
      const str = (off: number, s: string) => {
        for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
      }
      str(0, 'RIFF'); v.setUint32(4, 36, true); str(8, 'WAVE')
      str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
      v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true)
      v.setUint16(32, 2, true); v.setUint16(34, 16, true)
      str(36, 'data'); v.setUint32(40, 0, true)
      const silentBlob = new Blob([buf], { type: 'audio/wav' })

      form.append('audio', silentBlob, 'final.wav')
      form.append('call_id', callIdRef.current)
      form.append('lang_hint', 'uz')
      form.append('final', 'true')
      const res = await api.post<{ events: Array<Record<string, unknown>> }>(
        '/api/transcribe-chunk',
        form,
      )
      for (const ev of res.data.events ?? []) handleEvent(ev)
    } catch {
      // non-fatal — proceed to cleanup
    }
    // Cleanup
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    stopTick()
    setPttStatus('ended')
  }, [handleEvent, stopTick])

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------
  const reset = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    stopTick()
    callTimeRef.current = 0
    callIdRef.current = null
    dispatch({ type: 'RESET' })
    setPttStatus('idle')
  }, [stopTick])

  return {
    // All SessionState fields
    ...state,
    // PTT-specific
    pttStatus,
    startCall,
    startSpeaking,
    stopAndSendChunk,
    endCall,
    reset,
  }
}
