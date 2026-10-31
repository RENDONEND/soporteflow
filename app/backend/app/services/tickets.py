"""Reglas de tickets: plazos de SLA y estado de cumplimiento."""

from datetime import datetime, timezone

from app.models.models import PackStatus, Plans, TicketStatus, TicketType, UserRole
from app.services.sla_engine import DEFAULT_SLA_HOURS, add_working_hours

CLOSED_STATUSES = (TicketStatus.RESUELTO, TicketStatus.CERRADO)
WARNING_RATIO = 0.8

CLOSABLE_PACK_STATUSES = (
    PackStatus.APROBADO,
    PackStatus.EN_DESARROLLO,
    PackStatus.ENTREGADO,
    PackStatus.FACTURADO,
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def deadlines_for(
    plan: Plans, severity: str, opened_at: datetime
) -> tuple[datetime, datetime]:
    """Devuelve (plazo de primera respuesta, plazo de resolución) en UTC."""
    window = plan.window_coverage or {}
    resolution_map = plan.sla_by_severity or {}
    resolution_hours = float(resolution_map.get(severity, DEFAULT_SLA_HOURS))

    response_map = plan.response_sla_by_severity or resolution_map
    response_hours = float(response_map.get(severity, resolution_hours))
    response_hours = min(response_hours, resolution_hours)

    opened_at = ensure_utc(opened_at) or now_utc()
    return (
        add_working_hours(opened_at, response_hours, window),
        add_working_hours(opened_at, resolution_hours, window),
    )


def sla_state(
    deadline: datetime | None,
    opened_at: datetime | None,
    completed_at: datetime | None = None,
    now: datetime | None = None,
) -> str:
    """ok | warning | breached | met | none"""
    deadline = ensure_utc(deadline)
    if deadline is None:
        return "none"

    completed_at = ensure_utc(completed_at)
    now = now or now_utc()

    if completed_at is not None:
        return "met" if completed_at <= deadline else "breached"
    if now >= deadline:
        return "breached"

    opened_at = ensure_utc(opened_at)
    if opened_at is None:
        return "ok"

    total = (deadline - opened_at).total_seconds()
    if total <= 0:
        return "warning"
    used = (now - opened_at).total_seconds()
    return "warning" if used / total >= WARNING_RATIO else "ok"


def sla_summary(ticket, now: datetime | None = None) -> dict:
    now = now or now_utc()
    opened_at = ensure_utc(ticket.opened_at)
    return {
        "response_deadline": ensure_utc(ticket.response_deadline),
        "resolution_deadline": ensure_utc(ticket.sla_deadline),
        "first_response_at": ensure_utc(ticket.first_response_at),
        "resolved_at": ensure_utc(ticket.resolved_at),
        "response_state": sla_state(
            ticket.response_deadline, opened_at, ticket.first_response_at, now
        ),
        "resolution_state": sla_state(
            ticket.sla_deadline, opened_at, ticket.resolved_at, now
        ),
        "is_overdue": bool(
            ticket.status not in CLOSED_STATUSES
            and ticket.sla_deadline is not None
            and sla_state(ticket.sla_deadline, opened_at, None, now) == "breached"
        ),
    }


def serialize_ticket(ticket, user, detail: bool = True, now: datetime | None = None) -> dict:
    contract = ticket.contract
    application = contract.application
    client = application.client
    summary = sla_summary(ticket, now)

    comments = []
    time_logs = []
    attachments = []
    if detail:
        comments = [
            {
                "id": comment.id,
                "body": comment.body,
                "internal": comment.internal,
                "created_at": ensure_utc(comment.created_at),
                "user_name": comment.author.name if comment.author else None,
            }
            for comment in ticket.comments
            if user.role is not UserRole.CLIENTE or not comment.internal
        ]
        time_logs = [
            {
                "id": log.id,
                "hours": float(log.hours or 0),
                "logged_at": ensure_utc(log.logged_at),
                "note": log.note,
                "user_name": log.user.name if log.user else None,
            }
            for log in ticket.time_logs
        ]
        attachments = [
            {
                "id": attachment.id,
                "filename": attachment.filename,
                "content_type": attachment.content_type,
                "size": attachment.size,
                "created_at": ensure_utc(attachment.created_at),
                "user_name": attachment.author.name if attachment.author else None,
            }
            for attachment in ticket.attachments
        ]

    hours_logged = float(sum(float(log.hours or 0) for log in ticket.time_logs))

    packs = [
        {
            "id": pack.id,
            "name": pack.name or "",
            "status": pack.status,
            "price": float(pack.price or 0),
            "currency": pack.currency,
            "hours_estimated": float(pack.hours_estimated or 0),
        }
        for pack in ticket.packs
    ]
    pack_statuses = {PackStatus(pack.status) for pack in ticket.packs}
    closable = (
        ticket.type is not TicketType.FUNCIONALIDAD
        or bool(pack_statuses & set(CLOSABLE_PACK_STATUSES))
    )

    return {
        "id": ticket.id,
        "contract_id": ticket.contract_id,
        "client_id": client.id,
        "client_name": client.name,
        "application_name": application.name,
        "plan_name": contract.plan.name if contract.plan else "",
        "timezone": contract.timezone,
        "type": ticket.type,
        "severity": ticket.severity,
        "status": ticket.status,
        "title": ticket.title or "",
        "description": ticket.description,
        "assigned_to": ticket.assigned_to,
        "assigned_to_name": ticket.assignee.name if ticket.assignee else None,
        "created_by": ticket.created_by,
        "created_by_name": ticket.creator.name if ticket.creator else None,
        "opened_at": ensure_utc(ticket.opened_at),
        "response_deadline": summary["response_deadline"],
        "resolution_deadline": summary["resolution_deadline"],
        "first_response_at": summary["first_response_at"],
        "resolved_at": summary["resolved_at"],
        "response_state": summary["response_state"],
        "resolution_state": summary["resolution_state"],
        "is_overdue": summary["is_overdue"],
        "hours_logged": hours_logged,
        "packs": packs,
        "closable": closable,
        "comments": comments,
        "time_logs": time_logs,
        "attachments": attachments,
    }
