from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.models import Applications, Clients, Contracts, TicketStatus, Tickets, UserRole, Users
from app.services import hour_bank
from app.services.tickets import serialize_ticket

router = APIRouter(tags=["dashboard"])

CLOSED = (TicketStatus.RESUELTO, TicketStatus.CERRADO)


def _ticket_scope(query, user: Users):
    if user.role is UserRole.CLIENTE:
        return query.join(Contracts).join(Applications).where(
            Applications.client_id == user.client_id
        )
    return query


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    is_client = user.role is UserRole.CLIENTE

    contracts_query = select(Contracts).where(Contracts.state == "activo")
    if is_client:
        contracts_query = contracts_query.join(Applications).where(
            Applications.client_id == user.client_id
        )
    contracts = db.scalars(contracts_query).all()

    contract_cards = []
    assigned = consumed = remaining = 0.0
    alerts = []
    for contract in contracts:
        bank = hour_bank.get_bank(db, contract)
        assigned += bank["hours_assigned"]
        consumed += bank["hours_consumed"]
        remaining += bank["hours_remaining"]
        contract_cards.append(
            {
                "id": contract.id,
                "client_id": contract.application.client_id,
                "client_name": contract.application.client.name,
                "application_name": contract.application.name,
                "plan_name": contract.plan.name if contract.plan else "",
                "what_covers": (contract.plan.what_covers or []) if contract.plan else [],
                "state": contract.state,
                **bank,
            }
        )
        if bank["alert"] != "ok":
            alerts.append(
                {
                    "type": "bank",
                    "id": contract.id,
                    "title": f"Banco de horas {bank['alert']}",
                    "detail": f"{contract.application.client.name} · {contract.application.name}",
                    "remaining": bank["hours_remaining"],
                }
            )

    open_query = _ticket_scope(
        select(Tickets).where(Tickets.status.notin_(CLOSED)), user
    )
    open_tickets = db.scalars(open_query).all()
    overdue = [ticket for ticket in open_tickets if serialize_ticket(ticket, user, detail=False)["is_overdue"]]

    for ticket in overdue[:10]:
        alerts.append(
            {
                "type": "sla",
                "id": ticket.id,
                "title": "SLA vencido",
                "detail": f"#{ticket.id} {ticket.title}",
                "remaining": None,
            }
        )

    recent_query = _ticket_scope(select(Tickets), user)
    recent = db.scalars(
        recent_query.order_by(Tickets.opened_at.desc()).limit(6)
    ).all()

    counts = {
        "active_contracts": len(contracts),
        "open_tickets": len(open_tickets),
        "overdue_tickets": len(overdue),
    }
    if is_client:
        counts["clients"] = 1
        counts["applications"] = db.scalar(
            select(func.count(Applications.id)).where(
                Applications.client_id == user.client_id
            )
        ) or 0
    else:
        counts["clients"] = db.scalar(select(func.count(Clients.id))) or 0
        counts["applications"] = db.scalar(select(func.count(Applications.id))) or 0

    total_assigned = assigned or 0
    hours = {
        "assigned": round(assigned, 2),
        "consumed": round(consumed, 2),
        "remaining": round(remaining, 2),
        "percent_used": round(consumed / total_assigned * 100, 1) if total_assigned else 0,
    }

    db.commit()

    return {
        "role": user.role.value,
        "counts": counts,
        "hours": hours,
        "alerts": alerts[:12],
        "contracts": contract_cards,
        "recent_tickets": [
            serialize_ticket(ticket, user, detail=False) for ticket in recent
        ],
    }
