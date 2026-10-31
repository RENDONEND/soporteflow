"""Notificaciones internas y por email.

Cada aviso se guarda en `notifications` (visible en la campana del panel) y,
si hay SMTP configurado, se envía también por correo. El envío nunca bloquea la
operación: cualquier fallo se registra en el log y el flujo continúa.
"""

import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import (
    Applications,
    Contracts,
    NotificationType,
    Notifications,
    UserRole,
    Users,
)

log = logging.getLogger("soporteflow.notifications")


def ticket_link(ticket) -> str:
    return f"/tickets/{ticket.id}"


def agency_users(db: Session) -> list[Users]:
    return list(
        db.scalars(
            select(Users).where(Users.role.in_((UserRole.ADMIN, UserRole.TECNICO)))
        ).all()
    )


def client_users(db: Session, client_id: int) -> list[Users]:
    return list(
        db.scalars(
            select(Users).where(
                Users.role == UserRole.CLIENTE,
                Users.client_id == client_id,
            )
        ).all()
    )


def client_id_for_contract(db: Session, contract_id: int) -> int | None:
    row = db.execute(
        select(Applications.client_id)
        .join(Contracts, Contracts.application_id == Applications.id)
        .where(Contracts.id == contract_id)
    ).first()
    return row[0] if row else None


def send_email(to: str, subject: str, body: str, link: str | None = None) -> bool:
    if not settings.email_enabled:
        return False

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    full_body = body
    if link:
        full_body = f"{body}\n\n{settings.app_base_url.rstrip('/')}{link}"
    message.set_content(full_body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_tls:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
        return True
    except Exception:  # pragma: no cover - depende del servidor SMTP real
        log.exception("no se pudo enviar el email a %s", to)
        return False


def notify(
    db: Session,
    users: list[Users],
    type_: NotificationType,
    title: str,
    body: str | None = None,
    link: str | None = None,
    email: bool = True,
) -> list[Notifications]:
    """Crea el aviso para cada usuario y, si se pide, lo manda por email."""
    created = []
    seen: set[int] = set()
    for user in users:
        if user.id in seen:
            continue
        seen.add(user.id)
        notification = Notifications(
            user_id=user.id,
            type=type_,
            title=title,
            body=body,
            link=link,
        )
        if email and settings.email_enabled:
            notification.email_sent = send_email(user.email, title, body or title, link)
        db.add(notification)
        created.append(notification)
    if created:
        db.flush()
    return created


def notify_ticket(
    db: Session,
    ticket,
    type_: NotificationType,
    title: str,
    body: str | None = None,
    to_agency: bool = True,
    to_client: bool = True,
):
    users: list[Users] = []
    if to_agency:
        users.extend(agency_users(db))
    if to_client:
        users.extend(client_users(db, ticket.contract.application.client_id))
    return notify(db, users, type_, title, body=body, link=ticket_link(ticket))
