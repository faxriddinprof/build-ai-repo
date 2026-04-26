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

export interface IntakeProposal {
  customerName: string
  customerPassport: string
  customerRegion: string
  confidence: number
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
  sentiment: Sentiment
  complianceDone: string[]
  intakeProposal: IntakeProposal | null
  intakeConfirmed: boolean
  intakeDismissed: boolean
  summary: CallSummary | null
  error: string | null
}

export type SessionAction =
  | { type: 'CALL_STARTED'; callId: string }
  | { type: 'TRANSCRIPT'; entry: TranscriptEntry }
  | { type: 'SUGGESTION'; entry: SuggestionEntry }
  | { type: 'SENTIMENT'; sentiment: Sentiment }
  | { type: 'COMPLIANCE_TICK'; phraseId: string }
  | { type: 'INTAKE_PROPOSAL'; proposal: IntakeProposal }
  | { type: 'INTAKE_CONFIRMED' }
  | { type: 'INTAKE_DISMISSED' }
  | { type: 'SUMMARY_READY'; summary: CallSummary }
  | { type: 'ERROR'; message: string }
  | { type: 'TICK'; callTime: number }
  | { type: 'RESET' }

export interface ConfirmIntakeData {
  customer_name: string
  customer_passport: string
  customer_region: string
}

export interface CallSessionApi extends SessionState {
  start: (callId: string) => void
  endCall: () => void
  confirmIntake: (data: ConfirmIntakeData) => void
  dismissIntake: () => void
}
