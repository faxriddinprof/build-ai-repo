import type { SessionState, SessionAction } from '../types/session'

export const initialSessionState: SessionState = {
  status: 'idle',
  callId: null,
  callTime: 0,
  transcripts: [],
  suggestions: [],
  aiAnswers: [],
  sentiment: 'neutral',
  complianceDone: [],
  summary: null,
  error: null,
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'CALL_STARTED':
      // If already active (server confirmation after start()), only update callId — don't reset timer
      if (state.status === 'active') {
        return { ...state, callId: action.callId }
      }
      return {
        ...state,
        status: 'active',
        callId: action.callId,
        callTime: 0,
        error: null,
      }

    case 'TRANSCRIPT': {
      const transcripts = [...state.transcripts, action.entry]
      // Keep most recent 50
      return {
        ...state,
        transcripts: transcripts.length > 50 ? transcripts.slice(transcripts.length - 50) : transcripts,
      }
    }

    case 'SUGGESTION': {
      const suggestions = [action.entry, ...state.suggestions]
      // Keep most recent 5
      return {
        ...state,
        suggestions: suggestions.length > 5 ? suggestions.slice(0, 5) : suggestions,
      }
    }

    case 'SENTIMENT':
      return { ...state, sentiment: action.sentiment }

    case 'COMPLIANCE_TICK':
      if (state.complianceDone.includes(action.phraseId)) return state
      return { ...state, complianceDone: [...state.complianceDone, action.phraseId] }

    case 'AI_ANSWER_DELTA': {
      const existing = state.aiAnswers.find(a => a.id === action.messageId)
      if (existing) {
        return {
          ...state,
          aiAnswers: state.aiAnswers.map(a =>
            a.id === action.messageId
              ? { ...a, text: a.text + action.delta }
              : a
          ),
        }
      }
      return {
        ...state,
        aiAnswers: [
          ...state.aiAnswers.slice(-19), // keep max 20
          { id: action.messageId, text: action.delta, streaming: true, ts: action.ts },
        ],
      }
    }

    case 'AI_ANSWER_DONE':
      return {
        ...state,
        aiAnswers: state.aiAnswers.map(a =>
          a.id === action.messageId ? { ...a, streaming: false } : a
        ),
      }

    case 'SUMMARY_READY':
      return { ...state, status: 'ended', summary: action.summary }

    case 'ERROR':
      return { ...state, error: action.message }

    case 'TICK':
      return { ...state, callTime: action.callTime }

    case 'RESET':
      return { ...initialSessionState }

    default:
      return state
  }
}
