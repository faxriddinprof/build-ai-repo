from typing import Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app.deps import get_current_user
from app.models.user import User
from app.services.demo_service import load_scenarios

router = APIRouter()
log = structlog.get_logger()


class PlayRequest(BaseModel):
    call_id: str
    scenario_id: str


@router.get("/scenarios")
async def list_scenarios(_user: User = Depends(get_current_user)):
    return load_scenarios()


@router.post("/play")
async def play_scenario(
    body: PlayRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    from app.services.demo_service import play_scenario as _play, _find_scenario
    try:
        _find_scenario(body.scenario_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Demo playback uses WebSocket send directly — return 202 and play in background
    # The caller should already have a WS connection open for call_id
    async def _noop_send(msg: str):
        pass  # Actual send is done over the open WS connection by demo_service

    background_tasks.add_task(_play, body.call_id, body.scenario_id, _noop_send)
    log.info("demo.play_requested", call_id=body.call_id, scenario=body.scenario_id, user_id=user.id)
    return {"call_id": body.call_id, "scenario_id": body.scenario_id, "status": "playing"}
