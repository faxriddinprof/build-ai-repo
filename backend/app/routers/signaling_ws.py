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


@router.websocket("/ws/signaling")
async def signaling_ws(websocket: WebSocket):
    token = websocket.query_params.get("token", "")
    user = await _authenticate(token)
    if user is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    log.info("ws.signaling.connected", user_id=user.id)

    from app.services import webrtc_service
    from aiortc import RTCPeerConnection, RTCSessionDescription
    from aiortc.sdp import candidate_from_sdp

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
                candidate_str = msg.get("candidate")
                if not candidate_str:
                    continue
                try:
                    # Strip "candidate:" prefix if present
                    sdp_part = candidate_str
                    if sdp_part.startswith("candidate:"):
                        sdp_part = sdp_part[len("candidate:"):]
                    candidate = candidate_from_sdp(sdp_part)
                    candidate.sdpMid = msg.get("sdpMid")
                    candidate.sdpMLineIndex = msg.get("sdpMLineIndex")
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
