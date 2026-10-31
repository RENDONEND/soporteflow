"""Avisos automáticos del scheduler: SLA y banco de horas.

Se envían una sola vez por ticket/ciclo y por tipo: si ya existe una
notificación igual sin leer no se duplica.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import (
    Contracts,
    NotificationType,
    Notifications,
    TicketStatus,
    Tickets,
)
from app.services import hour_bank, notifications

CLOSED = (TicketStatus.RESUELTO, TicketStatus.CERRADO)


def _already_sent(db: Session, user_id: int, type_: NotificationType, link: str) -> bool:
    existing = db.scalar(
        select(Notifications).where(
            Notifications.user_id == user_id,
            Notifications.type == type_,
            Notifications.link == link,
        )
    )
    return existing is not None


def _notify_once(
    db: Session,
    users,
    type_: NotificationType,
    title: str,
    body: str,
    link: str,
) -> int:
    sent = 0
    for user in users:
        if _already_sent(db, user.id, type_, link):
            continue
        notifications.notify(db, [user], type_, title, body=body, link=link)
        sent += 1
    return sent


def notify_sla_alerts(db: Session, sla: dict) -> dict:
    """Avisa a la agencia por primera respuesta y resolución vencidas."""
    sent = {}
    breach_ids = set(sla.get("breached", [])) | set(sla.get("response_overdue", []))
    warning_ids = set(sla.get("warning", [])) - breach_ids
    if not breach_ids and not warning_ids:
        return sent

    agency = notifications.agency_users(db)
    tickets = db.scalars(
        select(Tickets).where(Tickets.id.in_(breach_ids | warning_ids))
    ).all()

    breach_count = 0
    warning_count = 0
    for ticket in tickets:
        link = f"/tickets/{ticket.id}"
        if ticket.id in breach_ids:
            breach_count += _notify_once(
                db,
                agency,
                NotificationType.SLA_VENCIDO,
                f"SLA vencido · ticket #{ticket.id}",
                ticket.title or "",
                link,
            )
        else:
            warning_count += _notify_once(
                db,
                agency,
                NotificationType.SLA_POR_VENCER,
                f"SLA por vencer · ticket #{ticket.id}",
                ticket.title or "",
                link,
            )
    return {"breached": breach_count, "warning": warning_count}


def notify_bank_alerts(db: Session) -> dict:
    """Avisa cuando un contrato activo llega al umbral o agota sus horas."""
    contracts = db.scalars(select(Contracts).where(Contracts.state == "activo")).all()
    agency = notifications.agency_users(db)
    sent = {"umbral": 0, "agotado": 0}

    for contract in contracts:
        snapshot = hour_bank.get_bank(db, contract)
        alert = snapshot["alert"]
        if alert not in ("umbral", "agotado"):
            continue
        client_id = contract.application.client_id
        type_ = (
            NotificationType.BANCO_AGOTADO
            if alert == "agotado"
            else NotificationType.BANCO_UMBRAL
        )
        link = f"/contracts/{contract.id}"
        label = "agotado" if alert == "agotado" else "en el umbral"
        body = (
            f"{contract.application.client.name} · {contract.application.name}: "
            f"{snapshot['hours_remaining']:.1f} h restantes de {snapshot['hours_assigned']:.1f} h"
        )
        for user in agency + notifications.client_users(db, client_id):
            if _already_sent(db, user.id, type_, link):
                continue
            notifications.notify(
                db,
                [user],
                type_,
                f"Banco de horas {label}",
                body=body,
                link=link,
            )
            sent[alert] += 1
    return sent
