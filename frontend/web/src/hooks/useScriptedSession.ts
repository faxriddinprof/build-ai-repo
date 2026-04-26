import { useReducer, useRef, useCallback } from 'react'
import { sessionReducer, initialSessionState } from './useSessionReducer'
import { DEMO_TIMELINE } from '../data/demoTimeline'
import type { CallSessionApi, ConfirmIntakeData, IntakeProposal } from '../types/session'

export function useScriptedSession(): CallSessionApi {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState)

  // Refs to avoid stale closures
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callTimeRef = useRef(0)

  // Tracks what has already been dispatched (by array index)
  const dispatchedTranscripts = useRef<Set<number>>(new Set())
  const dispatchedSuggestions = useRef<Set<number>>(new Set())
  const dispatchedCompliance = useRef<Set<string>>(new Set())
  const sentimentIndexRef = useRef(-1)
  const intakeSentRef = useRef(false)
  const endedRef = useRef(false)

  const endCall = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (endedRef.current) return
    endedRef.current = true

    const s = DEMO_TIMELINE.summary
    dispatch({
      type: 'SUMMARY_READY',
      summary: {
        natija: s.natija,
        etirozlar: s.etirozlar,
        keyingiQadam: s.keyingiQadam,
        complianceHolati: s.complianceHolati,
        callDuration: s.callDuration,
        sentiment: s.sentiment,
      },
    })
  }, [])

  const start = useCallback(
    (callId: string) => {
      // Reset tracking state
      callTimeRef.current = 0
      dispatchedTranscripts.current = new Set()
      dispatchedSuggestions.current = new Set()
      dispatchedCompliance.current = new Set()
      sentimentIndexRef.current = -1
      intakeSentRef.current = false
      endedRef.current = false

      dispatch({ type: 'RESET' })
      dispatch({ type: 'CALL_STARTED', callId })

      intervalRef.current = setInterval(() => {
        callTimeRef.current = Math.round((callTimeRef.current + 0.1) * 10) / 10
        const t = callTimeRef.current

        dispatch({ type: 'TICK', callTime: t })

        // Transcripts
        DEMO_TIMELINE.transcript.forEach((item, idx) => {
          if (!dispatchedTranscripts.current.has(idx) && item.t <= t) {
            dispatchedTranscripts.current.add(idx)
            dispatch({
              type: 'TRANSCRIPT',
              entry: {
                id: `demo-tr-${idx}`,
                speaker: item.speaker,
                text: item.text,
                ts: t,
              },
            })
          }
        })

        // Suggestions
        DEMO_TIMELINE.suggestions.forEach((item, idx) => {
          if (!dispatchedSuggestions.current.has(idx) && item.t <= t) {
            dispatchedSuggestions.current.add(idx)
            dispatch({
              type: 'SUGGESTION',
              entry: {
                id: `demo-sg-${idx}`,
                trigger: item.trigger,
                bullets: item.bullets,
                arrivedAt: t,
              },
            })
          }
        })

        // Sentiment — take latest shift at or before callTime
        let latestSentimentIdx = -1
        DEMO_TIMELINE.sentimentShifts.forEach((shift, idx) => {
          if (shift.t <= t) {
            latestSentimentIdx = idx
          }
        })
        if (latestSentimentIdx !== sentimentIndexRef.current && latestSentimentIdx >= 0) {
          sentimentIndexRef.current = latestSentimentIdx
          dispatch({
            type: 'SENTIMENT',
            sentiment: DEMO_TIMELINE.sentimentShifts[latestSentimentIdx].sentiment,
          })
        }

        // Compliance
        DEMO_TIMELINE.compliance.forEach((item) => {
          if (!dispatchedCompliance.current.has(item.id) && item.tickAt <= t) {
            dispatchedCompliance.current.add(item.id)
            dispatch({ type: 'COMPLIANCE_TICK', phraseId: item.id })
          }
        })

        // Intake proposal
        if (!intakeSentRef.current && t >= DEMO_TIMELINE.intakeAppears) {
          intakeSentRef.current = true
          const d = DEMO_TIMELINE.intakeData
          const proposal: IntakeProposal = {
            customerName: d.name,
            customerPassport: d.passport,
            customerRegion: d.region,
            confidence: 0.95,
          }
          dispatch({ type: 'INTAKE_PROPOSAL', proposal })
        }

        // End of demo
        if (t >= DEMO_TIMELINE.duration) {
          endCall()
        }
      }, 100)
    },
    [endCall],
  )

  const confirmIntake = useCallback((_data: ConfirmIntakeData) => {
    dispatch({ type: 'INTAKE_CONFIRMED' })
  }, [])

  const dismissIntake = useCallback(() => {
    dispatch({ type: 'INTAKE_DISMISSED' })
  }, [])

  return {
    ...state,
    start,
    endCall,
    confirmIntake,
    dismissIntake,
  }
}
