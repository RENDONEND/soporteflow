import os
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    ensure_client_access,
    get_current_user,
    require_agency,
    require_admin,
)
from app.db.session import get_db
from app.models.models import (
    Applications,
    Contracts,
    NotificationType,
    TicketAttachments,
    TicketComments,
    TicketSeverity,
    TicketStatus,
    TicketTimeLogs,
    TicketType,
    Tickets,
    UserRole,
    Users,
)
from app.schemas.ticket import (
    TicketAttachmentOut,
    TicketCommentCreate,
    TicketCreate,
    TicketOut,
    TicketTimeLogCreate,
    TicketUpdate,
)
from app.services import feature_packs, hour_bank, notifications
from app.services.tickets import deadlines_for, ensure_utc, now_utc, serialize_ticket

router = APIRouter(tags=["tickets"])

CLOSED = (TicketStatus.RESUELTO, TicketStatus.CERRADO)
FIRST_RESPONSE_STATUSES = (
    TicketStatus.EN_PROGRESO,
    TicketStatus.RESUELTO,
    TicketStatus.CERRADO,
)


def _get_ticket(db: Session, ticket_id: int, user: Users) -> Tickets:
    ticket = db.get(Tickets, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    ensure_client_access(user, ticket.contract.application.client_id)
    return ticket


def _attachment_out(attachment: TicketAttachments) -> dict:
    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "size": attachment.size,
        "created_at": ensure_utc(attachment.created_at),
        "user_name": attachment.author.name if attachment.author else None,
    }


def _ensure_pack_allows_close(ticket: Tickets) -> None:
    """RF-37: un ticket de funcionalidad no se cierra sin un pack aprobado."""
    allowed = [
        pack for pack in ticket.packs if feature_packs.is_closable(pack)
    ]
    if allowed:
        return
    linked = [pack for pack in ticket.packs]
    if linked:
        raise HTTPException(
            status_code=409,
            detail=(
                "El pack vinculado todavía no está aprobado por el cliente "
                "(RF-37). No se puede cerrar el ticket."
            ),
        )
    raise HTTPException(
        status_code=409,
        detail=(
            "Un ticket de funcionalidad no puede cerrarse sin un pack aprobado "
            "(RF-37). Creá el pack y esperá la aprobación del cliente."
        ),
    )


def _notify_status_change(
    db: Session, ticket: Tickets, user: Users, new_status: TicketStatus
) -> None:
    title = f"Ticket #{ticket.id} → {new_status.value}"
    body = ticket.title or ""
    from_client = user.role is UserRole.CLIENTE
    notifications.notify_ticket(
        db,
        ticket,
        NotificationType.TICKET_ESTADO,
        title,
        body=body,
        to_agency=from_client,
        to_client=not from_client,
    )


@router.get("/tickets", response_model=list[TicketOut])
def list_tickets(
    status_filter: TicketStatus | None = Query(default=None, alias="status"),
    severity: TicketSeverity | None = None,
    type_filter: TicketType | None = Query(default=None, alias="type"),
    contract_id: int | None = None,
    q: str | None = None,
    overdue: bool | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    query = select(Tickets).order_by(Tickets.opened_at.desc()).offset(offset).limit(limit)
    if user.role is UserRole.CLIENTE:
        query = (
            query.join(Contracts)
            .join(Applications)
            .where(Applications.client_id == user.client_id)
        )
    if status_filter is not None:
        query = query.where(Tickets.status == status_filter)
    if severity:
        query = query.where(Tickets.severity == severity)
    if type_filter is not None:
        query = query.where(Tickets.type == type_filter)
    if contract_id is not None:
        query = query.where(Tickets.contract_id == contract_id)
    if q:
        query = query.where(Tickets.title.ilike(f"%{q}%"))

    tickets = db.scalars(query).all()
    payload = [serialize_ticket(ticket, user, detail=False) for ticket in tickets]
    if overdue is not None:
        payload = [item for item in payload if item["is_overdue"] is overdue]
    return payload


@router.post("/tickets", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    contract = db.get(Contracts, payload.contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    ensure_client_access(user, contract.application.client_id)

    opened_at = now_utc()
    response_deadline = None
    resolution_deadline = None
    if payload.type is TicketType.SOPORTE:
        if contract.plan is None:
            raise HTTPException(status_code=409, detail="El contrato no tiene plan asociado")
        response_deadline, resolution_deadline = deadlines_for(
            contract.plan, payload.severity.value, opened_at
        )

    ticket = Tickets(
        contract_id=contract.id,
        type=payload.type,
        severity=payload.severity,
        status=TicketStatus.ABIERTO,
        title=payload.title,
        description=payload.description,
        created_by=user.id,
        opened_at=opened_at,
        response_deadline=response_deadline,
        sla_deadline=resolution_deadline,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    from_client = user.role is UserRole.CLIENTE
    notifications.notify_ticket(
        db,
        ticket,
        NotificationType.TICKET_CREADO,
        f"Ticket #{ticket.id}: {ticket.title}",
        body=f"Tipo {ticket.type.value} · abierto por {user.name}",
        to_agency=from_client,
        to_client=not from_client,
    )
    db.commit()
    return serialize_ticket(ticket, user)


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    return serialize_ticket(_get_ticket(db, ticket_id, user), user)


@router.patch("/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    user: Users = Depends(require_agency),
):
    ticket = _get_ticket(db, ticket_id, user)
    data = payload.model_dump(exclude_unset=True)

    if "severity" in data:
        if ticket.type is TicketType.FUNCIONALIDAD:
            raise HTTPException(
                status_code=400, detail="Un ticket de funcionalidad no lleva severidad"
            )
        ticket.severity = payload.severity
        if payload.severity is not None and ticket.contract.plan is not None:
            response_deadline, resolution_deadline = deadlines_for(
                ticket.contract.plan,
                payload.severity.value,
                ensure_utc(ticket.opened_at) or now_utc(),
            )
            ticket.response_deadline = response_deadline
            ticket.sla_deadline = resolution_deadline

    if "assigned_to" in data:
        if payload.assigned_to is None:
            ticket.assigned_to = None
        else:
            assignee = db.get(Users, payload.assigned_to)
            if assignee is None:
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
            if assignee.role is UserRole.CLIENTE:
                raise HTTPException(
                    status_code=400, detail="Solo un usuario de la agencia puede asignarse"
                )
            ticket.assigned_to = assignee.id

    for field in ("title", "description"):
        if field in data:
            setattr(ticket, field, data[field])

    if "status" in data and payload.status is not None:
        if (
            payload.status in CLOSED
            and ticket.type is TicketType.FUNCIONALIDAD
        ):
            _ensure_pack_allows_close(ticket)
        ticket.status = payload.status
        if payload.status in CLOSED:
            ticket.resolved_at = now_utc()
        else:
            ticket.resolved_at = None
        if payload.status in FIRST_RESPONSE_STATUSES and ticket.first_response_at is None:
            ticket.first_response_at = now_utc()

    db.commit()
    db.refresh(ticket)

    if "status" in data and payload.status is not None:
        _notify_status_change(db, ticket, user, payload.status)
        db.commit()
    return serialize_ticket(ticket, user)


@router.post("/tickets/{ticket_id}/comments", response_model=TicketOut)
def add_comment(
    ticket_id: int,
    payload: TicketCommentCreate,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    ticket = _get_ticket(db, ticket_id, user)
    if payload.internal and user.role is UserRole.CLIENTE:
        raise HTTPException(
            status_code=403, detail="Solo el equipo puede escribir notas internas"
        )

    comment = TicketComments(
        ticket_id=ticket.id,
        user_id=user.id,
        body=payload.body.strip(),
        internal=payload.internal,
    )
    db.add(comment)

    if user.role is not UserRole.CLIENTE and ticket.first_response_at is None:
        ticket.first_response_at = now_utc()

    db.commit()
    db.refresh(ticket)

    if not payload.internal:
        from_client = user.role is UserRole.CLIENTE
        notifications.notify_ticket(
            db,
            ticket,
            NotificationType.TICKET_COMENTARIO,
            f"Nuevo comentario en el ticket #{ticket.id}",
            body=payload.body.strip()[:280],
            to_agency=from_client,
            to_client=not from_client,
        )
        db.commit()
    return serialize_ticket(ticket, user)


@router.post("/tickets/{ticket_id}/time-logs", response_model=TicketOut)
def add_time_log(
    ticket_id: int,
    payload: TicketTimeLogCreate,
    db: Session = Depends(get_db),
    user: Users = Depends(require_agency),
):
    ticket = _get_ticket(db, ticket_id, user)
    if ticket.contract.state != "activo":
        raise HTTPException(
            status_code=409,
            detail="El contrato está archivado; no admite nuevos consumos",
        )
    now = now_utc()

    db.add(
        TicketTimeLogs(
            ticket_id=ticket.id,
            user_id=user.id,
            hours=payload.hours,
            logged_at=now,
            note=payload.note,
        )
    )
    if ticket.first_response_at is None:
        ticket.first_response_at = now
    if ticket.status == TicketStatus.ABIERTO:
        ticket.status = TicketStatus.EN_PROGRESO

    if ticket.type is TicketType.SOPORTE:
        note = f"Ticket #{ticket.id}"
        if payload.note:
            note = f"{note}: {payload.note}"
        try:
            hour_bank.consume(
                db,
                ticket.contract,
                payload.hours,
                note=note,
                user_id=user.id,
            )
        except hour_bank.CycleClosedError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except hour_bank.HourBankError as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket, user)


@router.post(
    "/tickets/{ticket_id}/attachments",
    response_model=TicketAttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    ticket = _get_ticket(db, ticket_id, user)

    original_name = os.path.basename(file.filename or "adjunto")
    suffix = Path(original_name).suffix[:12]
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    destination = upload_dir / f"{uuid.uuid4().hex}{suffix}"
    limit = settings.max_upload_mb * 1024 * 1024
    size = 0
    try:
        with destination.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(
                        status_code=413,
                        detail=f"El archivo supera los {settings.max_upload_mb} MB",
                    )
                handle.write(chunk)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    attachment = TicketAttachments(
        ticket_id=ticket.id,
        user_id=user.id,
        filename=original_name,
        content_type=file.content_type,
        size=size,
        storage_path=str(destination.resolve()),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return _attachment_out(attachment)


@router.get("/tickets/{ticket_id}/attachments/{attachment_id}")
def download_attachment(
    ticket_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    _get_ticket(db, ticket_id, user)
    attachment = db.get(TicketAttachments, attachment_id)
    if attachment is None or attachment.ticket_id != ticket_id:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")

    path = Path(attachment.storage_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="El archivo ya no está disponible")

    return FileResponse(
        path,
        media_type=attachment.content_type or "application/octet-stream",
        filename=attachment.filename,
    )


@router.delete(
    "/tickets/{ticket_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_attachment(
    ticket_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    ticket = db.get(Tickets, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    attachment = db.get(TicketAttachments, attachment_id)
    if attachment is None or attachment.ticket_id != ticket_id:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")

    Path(attachment.storage_path).unlink(missing_ok=True)
    db.delete(attachment)
    db.commit()
