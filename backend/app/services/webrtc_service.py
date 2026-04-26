"""
aiortc-based WebRTC service.

One RTCPeerConnection per call. Audio track → STT pipeline via call_pipeline.
DataChannel 'transcripts' carries bidirectional control + event messages.
"""
import asyncio
import json
import time
from typing import Optional
from uuid import uuid4

import structlog

from app.config import settings
from app.utils.audio import ChunkBuffer

log = structlog.get_logger()

# Active DataChannels keyed by call_id — used by call_pipeline for background events
_active_dcs: dict[str, object] = {}
# Active PeerConnections keyed by call_id
_active_pcs: dict[str, object] = {}


def get_ice_configuration() -> dict:
    servers = [{"urls": url} for url in settings.STUN_SERVERS]
    if settings.TURN_SERVER and settings.TURN_USER and settings.TURN_PASSWORD:
        servers.append({
            "urls": settings.TURN_SERVER,
            "username": settings.TURN_USER,
            "credential": settings.TURN_PASSWORD,
        })
    return {"iceServers": servers}


async def send_to_call(call_id: str, event: dict) -> None:
    """Send an event dict to the DataChannel for a given call_id."""
    dc = _active_dcs.get(call_id)
    if dc is not None:
        try:
            if dc.readyState == "open":
                dc.send(json.dumps(event))
        except Exception as e:
            log.warning("webrtc.dc_send_error", call_id=call_id, error=str(e))


async def create_peer_connection(user_id: str) -> "RTCPeerConnection":
    from aiortc import RTCPeerConnection, RTCConfiguration, RTCIceServer

    ice_servers = []
    for url in settings.STUN_SERVERS:
        ice_servers.append(RTCIceServer(urls=url))
    if settings.TURN_SERVER and settings.TURN_USER and settings.TURN_PASSWORD:
        ice_servers.append(RTCIceServer(
            urls=settings.TURN_SERVER,
            username=settings.TURN_USER,
            credential=settings.TURN_PASSWORD,
        ))

    config = RTCConfiguration(iceServers=ice_servers) if ice_servers else RTCConfiguration()
    pc = RTCPeerConnection(configuration=config)
    call_id: Optional[str] = None
    lang_hint: Optional[str] = None
    buf = ChunkBuffer(sample_rate=16000, min_seconds=settings.WEBRTC_AUDIO_CHUNK_SECONDS)

    @pc.on("track")
    def on_track(track):
        if track.kind == "audio":
            asyncio.ensure_future(_consume_audio(track, pc, buf))

    @pc.on("datachannel")
    def on_datachannel(dc):
        nonlocal call_id, lang_hint
        log.info("webrtc.dc_opened", user_id=user_id, label=dc.label)

        @dc.on("message")
        async def on_message(raw):
            nonlocal call_id, lang_hint
            try:
                msg = json.loads(raw) if isinstance(raw, str) else json.loads(raw.decode())
            except Exception:
                return
            msg_type = msg.get("type")

            if msg_type == "start_call":
                from app.services import call_pipeline
                call_id = msg.get("call_id") or str(uuid4())
                lang_hint = msg.get("language_hint")
                client_id = msg.get("client_id") or None
                _active_dcs[call_id] = dc
                if call_id not in _active_pcs:
                    _active_pcs[call_id] = pc
                await call_pipeline.start_call(
                    call_id, user_id, lang_hint=lang_hint, client_id=client_id
                )
                dc.send(json.dumps({"type": "call_started", "call_id": call_id}))
                log.info("webrtc.call_started", call_id=call_id, user_id=user_id)

            elif msg_type == "trigger_intake_extraction":
                if call_id:
                    from app.services import call_pipeline
                    asyncio.create_task(_run_extraction_and_send(call_id, dc))

            elif msg_type == "end_call":
                if call_id:
                    from app.services import call_pipeline
                    await _end_call(call_id, dc, pc)
                    call_id = None

        @dc.on("close")
        def on_dc_close():
            log.info("webrtc.dc_closed", user_id=user_id)

    @pc.on("connectionstatechange")
    async def on_connection_state():
        log.info("webrtc.connection_state", state=pc.connectionState, user_id=user_id)
        if pc.connectionState in ("failed", "closed"):
            cid = _find_call_id(pc)
            if cid:
                _cleanup(cid)

    return pc


async def _consume_audio(track, pc, buf: ChunkBuffer):
    import av

    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=16000)
    call_id: Optional[str] = None
    lang_hint: Optional[str] = None

    from aiortc.mediastreams import MediaStreamError

    while True:
        try:
            frame = await track.recv()
        except MediaStreamError:
            break
        except Exception as e:
            log.warning("webrtc.track_recv_error", error=str(e))
            break

        # Resample Opus/any → 16 kHz mono int16
        try:
            resampled = resampler.resample(frame)
            for f in resampled:
                pcm_bytes = bytes(f.planes[0])
                flushed = buf.push(pcm_bytes)
                if flushed:
                    cid = _find_call_id(pc)
                    if cid:
                        lh = _get_lang_hint(cid)
                        asyncio.create_task(_process_and_send(cid, flushed, lh))
        except Exception as e:
            log.warning("webrtc.resample_error", error=str(e))


async def _process_and_send(call_id: str, pcm_bytes: bytes, lang_hint: Optional[str]):
    from app.services import call_pipeline
    try:
        events = await call_pipeline.process_audio_chunk(call_id, pcm_bytes, lang_hint)
    except Exception as e:
        log.error("webrtc.pipeline_error", call_id=call_id, error=str(e))
        return
    dc = _active_dcs.get(call_id)
    if dc and dc.readyState == "open":
        for event in events:
            try:
                dc.send(json.dumps(event))
            except Exception:
                break


async def _run_extraction_and_send(call_id: str, dc):
    from app.services import call_pipeline
    event = await call_pipeline.run_intake_extraction(call_id)
    if event and dc.readyState == "open":
        dc.send(json.dumps(event))


async def _end_call(call_id: str, dc, pc):
    from app.services import call_pipeline
    try:
        event = await call_pipeline.finalize_call(call_id)
        if dc.readyState == "open":
            dc.send(json.dumps(event))
    except Exception as e:
        log.error("webrtc.end_call_error", call_id=call_id, error=str(e))
    finally:
        _cleanup(call_id)
        await pc.close()


def _find_call_id(pc) -> Optional[str]:
    for cid, stored_pc in _active_pcs.items():
        if stored_pc is pc:
            return cid
    return None


def _get_lang_hint(call_id: str) -> Optional[str]:
    # lang_hint is stored per-call inside call_pipeline state; access via state dict
    from app.services.call_pipeline import _call_state
    state = _call_state.get(call_id, {})
    return state.get("lang_hint")


def _cleanup(call_id: str):
    _active_dcs.pop(call_id, None)
    _active_pcs.pop(call_id, None)


async def close_all() -> None:
    """Gracefully close all active PeerConnections on shutdown."""
    for call_id, pc in list(_active_pcs.items()):
        try:
            await pc.close()
        except Exception:
            pass
    _active_pcs.clear()
    _active_dcs.clear()
