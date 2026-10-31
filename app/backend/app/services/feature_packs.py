"""Packs de funcionalidades.

Un pack agrupa uno o varios tickets de tipo `funcionalidad`, con alcance,
estimación y precio. Se envía al cliente para aprobación y queda registrado
quién decidió y cuándo. **Las horas del pack no tocan el banco de horas** del
contrato; se miden aparte a partir de los time logs de sus tickets.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import FeaturePacks, PackStatus, Tickets, TicketType
from app.services.tickets import ensure_utc

OPEN_STATUSES = (
    PackStatus.PROPUESTO,
    PackStatus.APROBADO,
    PackStatus.EN_DESARROLLO,
    PackStatus.ENTREGADO,
)
# Estados de pack que habilitan cerrar un ticket de funcionalidad (RF-37).
CLOSABLE_STATUSES = (
    PackStatus.APROBADO,
    PackStatus.EN_DESARROLLO,
    PackStatus.ENTREGADO,
    PackStatus.FACTURADO,
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def realized_hours(pack: FeaturePacks) -> float:
    return float(sum(float(log.hours or 0) for ticket in pack.tickets for log in ticket.time_logs))


def is_closable(pack: FeaturePacks) -> bool:
    return PackStatus(pack.status) in CLOSABLE_STATUSES


def tickets_ready_for_pack(db: Session, contract_id: int) -> list[Tickets]:
    """Tickets de funcionalidad del contrato que aún no están en ningún pack."""
    return list(
        db.scalars(
            select(Tickets)
            .where(
                Tickets.contract_id == contract_id,
                Tickets.type == TicketType.FUNCIONALIDAD,
            )
            .order_by(Tickets.opened_at.desc())
        ).all()
    )


def serialize_pack(pack: FeaturePacks, detail: bool = True) -> dict:
    hours_real = realized_hours(pack)
    estimated = float(pack.hours_estimated or 0)
    return {
        "id": pack.id,
        "contract_id": pack.contract_id,
        "client_id": pack.contract.application.client_id,
        "client_name": pack.contract.application.client.name,
        "application_name": pack.contract.application.name,
        "name": pack.name or "",
        "description": pack.description,
        "status": pack.status,
        "hours_estimated": estimated,
        "hours_real": hours_real,
        "price": float(pack.price or 0),
        "currency": pack.currency,
        "created_at": ensure_utc(pack.created_at),
        "decided_at": ensure_utc(pack.decided_at),
        "decided_by_name": pack.decider.name if pack.decider else None,
        "approved_at": ensure_utc(pack.approved_at),
        "approved_by_name": pack.approver.name if pack.approver else None,
        "delivered_at": ensure_utc(pack.delivered_at),
        "billed_at": ensure_utc(pack.billed_at),
        "rejection_reason": pack.rejection_reason,
        "ticket_ids": [ticket.id for ticket in pack.tickets],
        "tickets": [
            {
                "id": ticket.id,
                "title": ticket.title or "",
                "status": ticket.status,
                "hours_logged": float(
                    sum(float(log.hours or 0) for log in ticket.time_logs)
                ),
            }
            for ticket in sorted(pack.tickets, key=lambda item: item.id)
        ]
        if detail
        else [],
    }
