"""
Public customer page endpoint.

GET /customer/{client_id}/call
- No JWT required.
- Rate-limited: 10 req/min per IP.
- Creates a fresh CallQueueEntry, issues a customer_token, returns display info.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_db
from app.middleware.rate_limit import limiter
from app.models.client import Client
from app.models.call_queue import CallQueueEntry
from app.services.auth_service import create_customer_token
from app.services import event_bus
from app.services import queue_service
from app.utils.text import mask_phone

router = APIRouter(prefix="/customer")


@router.get("/{client_id}/call")
@limiter.limit("10/minute")
async def customer_call_page(
    request: Request,
    client_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint. Returns display info + ICE servers + customer_token.
    Creates a fresh CallQueueEntry associated with the client.
    """
    res = await db.execute(select(Client).where(Client.client_id == client_id, Client.is_active == True))
    client = res.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")

    # Derive masked phone from primary contact
    masked = None
    region: Optional[str] = None
    try:
        from app.models.banking import Contact
        c_res = await db.execute(
            select(Contact)
            .where(Contact.client_id == client_id, Contact.is_primary_phone == True)
            .limit(1)
        )
        contact = c_res.scalar_one_or_none()
        if contact is None:
            c_res2 = await db.execute(
                select(Contact).where(Contact.client_id == client_id).limit(1)
            )
            contact = c_res2.scalar_one_or_none()
        if contact:
            masked = mask_phone(contact.phone) if contact.phone else None
            region = contact.region
    except Exception:
        pass

    last_initial = (client.last_name[0] + ".") if client.last_name else ""
    display_name = f"{client.first_name} {last_initial}".strip()

    # Issue temp token, enqueue, re-issue with real queue_id
    token, jti = create_customer_token("temp")
    entry = await queue_service.enqueue(
        db,
        masked_phone=masked or "N/A",
        region=region,
        topic=None,
        priority="normal",
        customer_token_jti=jti,
        client_id=client_id,
    )
    token, jti = create_customer_token(entry.id)
    entry.customer_token_jti = jti
    await db.commit()

    await event_bus.publish("supervisor", {
        "type": "queue_added",
        "queue_id": entry.id,
        "masked_phone": masked,
        "region": region,
        "client_id": client_id,
        "priority": "normal",
    })

    ice_servers = [{"urls": url} for url in settings.STUN_SERVERS]

    return {
        "display_name": display_name,
        "masked_phone": masked,
        "region": region,
        "ice_servers": ice_servers,
        "customer_token": token,
        "queue_id": entry.id,
    }
