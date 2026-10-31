"""Monitor de SLA para el scheduler: cuenta tickets vencidos y por vencer."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import TicketStatus, Tickets
from app.services.tickets import now_utc, sla_state

CLOSED = (TicketStatus.RESUELTO, TicketStatus.CERRADO)


def check_sla(db: Session, now: datetime | None = None) -> dict:
    now = now or now_utc()
    tickets = db.scalars(
        select(Tickets).where(
            Tickets.status.notin_(CLOSED),
            Tickets.sla_deadline.is_not(None),
        )
    ).all()

    breached = []
    warning = []
    response_overdue = []
    for ticket in tickets:
        state = sla_state(ticket.sla_deadline, ticket.opened_at, ticket.resolved_at, now)
        if state == "breached":
            breached.append(ticket.id)
        elif state == "warning":
            warning.append(ticket.id)

        if sla_state(
            ticket.response_deadline, ticket.opened_at, ticket.first_response_at, now
        ) == "breached":
            response_overdue.append(ticket.id)

    return {
        "open_with_sla": len(tickets),
        "breached": breached,
        "warning": warning,
        "response_overdue": response_overdue,
    }
