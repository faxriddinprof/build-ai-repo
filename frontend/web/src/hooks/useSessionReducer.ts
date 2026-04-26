import type { SessionState, SessionAction } from '../types/session'

export const initialSessionState: SessionState = {
  status: 'idle',
  callId: null,
  callTime: 0,
  transcripts: [],
  suggestions: [],
  sentiment: 'neutral',
  complianceDone: [],
  intakeProposal: null,
  intakeConfirmed: false,
  intakeDismissed: false,
  summary: null,
  error: null,
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'CALL_STARTED':
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

    case 'INTAKE_PROPOSAL':
      return {
        ...state,
        intakeProposal: action.proposal,
        intakeConfirmed: false,
        intakeDismissed: false,
      }

    case 'INTAKE_CONFIRMED':
      return { ...state, intakeConfirmed: true }

    case 'INTAKE_DISMISSED':
      return { ...state, intakeDismissed: true }

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
