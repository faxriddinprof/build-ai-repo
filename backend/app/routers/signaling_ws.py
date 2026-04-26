"""
WebRTC signaling endpoint.

WS /ws/signaling?token=<jwt>

Carries SDP offer/answer and ICE candidates only. The audio path is handled
independently by the RTCPeerConnection after signaling completes.
"""
import asyncio
import json
from typing import Optional

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.call_queue import CallQueueEntry
from app.services.auth_service import decode_token

router = APIRouter()
log = structlog.get_logger()


async def _authenticate(token: str) -> Optional[User]:
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except JWTError:
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
    if user is None or not user.is_active or user.role not in ("agent", "admin"):
        return None
    return user


async def _authenticate_customer(token: str) -> Optional[str]:
    """Returns queue_id if token is a valid accepted customer token, else None."""
    try:
        payload = decode_token(token)
    except JWTError:
        return None
    if payload.get("type") != "customer":
        return None
    sub = payload.get("sub", "")
    if not sub.startswith("queue:"):
        return None
    queue_id = sub[len("queue:"):]
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CallQueueEntry).where(
                CallQueueEntry.id == queue_id,
                CallQueueEntry.status == "accepted",
            )
        )
        entry = result.scalar_one_or_none()
    return queue_id if entry else None


def _parse_ice_candidate(msg: dict):
    """Parse ICE candidate from message — handles both string and dict formats."""
    from aiortc.sdp import candidate_from_sdp

    raw = msg.get("candidate")
    if not raw:
        return None

    # Frontend may send candidate as a dict (RTCIceCandidate.toJSON()) or as a plain string
    if isinstance(raw, dict):
        candidate_str = raw.get("candidate", "")
        sdp_mid = raw.get("sdpMid") or msg.get("sdpMid")
        sdp_mline = raw.get("sdpMLineIndex") if raw.get("sdpMLineIndex") is not None else msg.get("sdpMLineIndex")
    else:
        candidate_str = raw
        sdp_mid = msg.get("sdpMid")
        sdp_mline = msg.get("sdpMLineIndex")

    if not candidate_str:
        return None
    if candidate_str.startswith("candidate:"):
        candidate_str = candidate_str[len("candidate:"):]

    candidate = candidate_from_sdp(candidate_str)
    candidate.sdpMid = sdp_mid
    candidate.sdpMLineIndex = sdp_mline
    return candidate


@router.websocket("/ws/signaling")
async def signaling_ws(websocket: WebSocket):
    token = websocket.query_params.get("token", "")

    # Try customer token first (cheaper — no DB User lookup on agent path)
    queue_id = await _authenticate_customer(token)
    if queue_id is not None:
        await _customer_signaling(websocket, queue_id)
        return

    user = await _authenticate(token)
    if user is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    log.info("ws.signaling.connected", user_id=user.id)

    from app.services import webrtc_service
    from aiortc import RTCPeerConnection, RTCSessionDescription

    pc = await webrtc_service.create_peer_connection(str(user.id))

    # Forward server ICE candidates to the client via this signaling WS
    @pc.on("icecandidate")
    async def on_local_ice(candidate):
        if candidate is not None:
            try:
                await websocket.send_json({
                    "type": "ice-candidate",
                    "candidate": f"candidate:{candidate.to_sdp()}",
                    "sdpMid": candidate.sdpMid,
                    "sdpMLineIndex": candidate.sdpMLineIndex,
                })
            except Exception:
                pass

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            except asyncio.TimeoutError:
                log.info("ws.signaling.timeout", user_id=user.id)
                break

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "offer":
                sdp = msg.get("sdp", "")
                offer = RTCSessionDescription(sdp=sdp, type="offer")
                await pc.setRemoteDescription(offer)
                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                await websocket.send_json({
                    "type": "answer",
                    "sdp": pc.localDescription.sdp,
                })
                log.info("ws.signaling.answer_sent", user_id=user.id)

            elif msg_type == "ice-candidate":
                try:
                    candidate = _parse_ice_candidate(msg)
                    if candidate:
                        await pc.addIceCandidate(candidate)
                except Exception as e:
                    log.warning("ws.signaling.ice_parse_error", error=str(e))

    except WebSocketDisconnect:
        log.info("ws.signaling.disconnected", user_id=user.id)
    except Exception as e:
        log.error("ws.signaling.error", error=str(e), user_id=user.id)
    finally:
        log.info("ws.signaling.closed", user_id=user.id)
        # PC stays alive — it's tracked in webrtc_service._active_pcs


async def _customer_signaling(websocket: WebSocket, queue_id: str):
    """Lightweight signaling handler for customer browser WebRTC connections."""
    from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer
    from app.config import settings

    await websocket.accept()
    log.info("ws.signaling.customer_connected", queue_id=queue_id)

    ice_servers = [RTCIceServer(urls=url) for url in settings.STUN_SERVERS]
    pc = RTCPeerConnection(configuration=RTCConfiguration(iceServers=ice_servers))

    @pc.on("icecandidate")
    async def on_local_ice(candidate):
        if candidate is not None:
            try:
                await websocket.send_json({
                    "type": "ice-candidate",
                    "candidate": f"candidate:{candidate.to_sdp()}",
                    "sdpMid": candidate.sdpMid,
                    "sdpMLineIndex": candidate.sdpMLineIndex,
                })
            except Exception:
                pass

    @pc.on("datachannel")
    def on_dc(dc):
        @dc.on("message")
        async def on_msg(raw):
            try:
                msg = json.loads(raw) if isinstance(raw, str) else json.loads(raw.decode())
            except Exception:
                return
            if msg.get("type") == "start_call":
                dc.send(json.dumps({"type": "call_started"}))

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            except asyncio.TimeoutError:
                break

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "offer":
                sdp = msg.get("sdp", "")
                offer = RTCSessionDescription(sdp=sdp, type="offer")
                await pc.setRemoteDescription(offer)
                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                await websocket.send_json({"type": "answer", "sdp": pc.localDescription.sdp})
                log.info("ws.signaling.customer_answer_sent", queue_id=queue_id)

            elif msg_type == "ice-candidate":
                try:
                    candidate = _parse_ice_candidate(msg)
                    if candidate:
                        await pc.addIceCandidate(candidate)
                except Exception as e:
                    log.warning("ws.signaling.customer_ice_error", error=str(e))

            elif msg_type == "end_call":
                break

    except WebSocketDisconnect:
        log.info("ws.signaling.customer_disconnected", queue_id=queue_id)
    except Exception as e:
        log.error("ws.signaling.customer_error", error=str(e), queue_id=queue_id)
    finally:
        await pc.close()
        log.info("ws.signaling.customer_closed", queue_id=queue_id)
