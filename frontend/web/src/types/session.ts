export type SessionStatus = 'idle' | 'connecting' | 'active' | 'ended'
export type Sentiment = 'positive' | 'negative' | 'neutral'

export interface TranscriptEntry {
  id: string
  speaker: 'agent' | 'customer' | 'Operator' | 'Mijoz'
  text: string
  ts: number
}

export interface SuggestionEntry {
  id: string
  trigger: string
  bullets: string[]
  arrivedAt: number
}

export interface AIAnswerEntry {
  id: string
  text: string
  streaming: boolean
  ts: number
}

export interface CallSummary {
  outcome?: string
  objections?: string[]
  nextAction?: string
  // demo mode fields
  natija?: string
  etirozlar?: string[]
  keyingiQadam?: string
  complianceHolati?: { passed: number; total: number }
  callDuration?: string
  sentiment?: string
}

export interface SessionState {
  status: SessionStatus
  callId: string | null
  callTime: number
  transcripts: TranscriptEntry[]
  suggestions: SuggestionEntry[]
  aiAnswers: AIAnswerEntry[]
  sentiment: Sentiment
  complianceDone: string[]
  summary: CallSummary | null
  error: string | null
}

export type SessionAction =
  | { type: 'CALL_STARTED'; callId: string }
  | { type: 'TRANSCRIPT'; entry: TranscriptEntry }
  | { type: 'SUGGESTION'; entry: SuggestionEntry }
  | { type: 'SENTIMENT'; sentiment: Sentiment }
  | { type: 'COMPLIANCE_TICK'; phraseId: string }
  | { type: 'AI_ANSWER_DELTA'; messageId: string; delta: string; ts: number }
  | { type: 'AI_ANSWER_DONE'; messageId: string }
  | { type: 'SUMMARY_READY'; summary: CallSummary }
  | { type: 'ERROR'; message: string }
  | { type: 'TICK'; callTime: number }
  | { type: 'RESET' }

export interface CallSessionApi extends SessionState {
  start: (callId: string) => void
  endCall: () => void
  reset: () => void
}
