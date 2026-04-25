from typing import Any, Optional
from pydantic import BaseModel


# ── Inbound (client → server) ──────────────────────────────────────────────

class StartCallMsg(BaseModel):
    type: str = "start_call"
    call_id: Optional[str] = None
    language_hint: Optional[str] = None  # "uz" | "ru"


class AudioChunkMsg(BaseModel):
    type: str = "audio_chunk"
    call_id: str
    pcm_b64: str   # base64-encoded 16-bit PCM @ 16 kHz mono
    sample_rate: int = 16000


class TriggerIntakeMsg(BaseModel):
    type: str = "trigger_intake_extraction"
    call_id: str


class EndCallMsg(BaseModel):
    type: str = "end_call"
    call_id: str


# ── Outbound (server → client) ─────────────────────────────────────────────

class TranscriptEvent(BaseModel):
    type: str = "transcript"
    call_id: str
    speaker: str   # "agent" | "customer"
    text: str
    ts: float      # epoch seconds


class SuggestionEvent(BaseModel):
    type: str = "suggestion"
    call_id: str
    text: list[str]   # up to 3 bullets
    trigger: str


class SentimentEvent(BaseModel):
    type: str = "sentiment"
    call_id: str
    sentiment: str   # "positive" | "neutral" | "negative"
    confidence: float


class ComplianceTickEvent(BaseModel):
    type: str = "compliance_tick"
    call_id: str
    phrase_id: str


class IntakeProposalEvent(BaseModel):
    type: str = "intake_proposal"
    call_id: str
    data: dict   # customer_name, customer_passport, customer_region, confidence


class SummaryReadyEvent(BaseModel):
    type: str = "summary_ready"
    call_id: str
    summary: dict


class ErrorEvent(BaseModel):
    type: str = "error"
    call_id: Optional[str] = None
    code: str
    message: str
