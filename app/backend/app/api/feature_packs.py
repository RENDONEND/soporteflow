from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    ensure_client_access,
    get_current_user,
    require_admin,
    require_agency,
)
from app.db.session import get_db
from app.models.models import (
    Applications,
    Contracts,
    FeaturePacks,
    NotificationType,
    PackStatus,
    Tickets,
    TicketType,
    UserRole,
    Users,
)
from app.schemas.feature_pack import (
    FeaturePackCreate,
    FeaturePackDecision,
    FeaturePackOut,
    FeaturePackStatusUpdate,
    FeaturePackUpdate,
)
from app.services import feature_packs, notifications
from app.services.tickets import now_utc

router = APIRouter(prefix="/feature-packs", tags=["feature-packs"])


def _get_pack(db: Session, pack_id: int, user: Users) -> FeaturePacks:
    pack = db.get(FeaturePacks, pack_id)
    if pack is None:
        raise HTTPException(status_code=404, detail="Pack no encontrado")
    ensure_client_access(user, pack.contract.application.client_id)
    return pack


def _contract_for(db: Session, contract_id: int, user: Users) -> Contracts:
    contract = db.get(Contracts, contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    ensure_client_access(user, contract.application.client_id)
    return contract


@router.get("", response_model=list[FeaturePackOut])
def list_packs(
    contract_id: int | None = None,
    pack_status: PackStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    query = select(FeaturePacks).order_by(FeaturePacks.created_at.desc())
    if user.role is UserRole.CLIENTE:
        query = (
            query.join(Contracts)
            .join(Applications)
            .where(Applications.client_id == user.client_id)
        )
    if contract_id is not None:
        query = query.where(FeaturePacks.contract_id == contract_id)
    if pack_status is not None:
        query = query.where(FeaturePacks.status == pack_status)
    return [feature_packs.serialize_pack(pack) for pack in db.scalars(query).all()]


@router.get("/{pack_id}", response_model=FeaturePackOut)
def get_pack(
    pack_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    return feature_packs.serialize_pack(_get_pack(db, pack_id, user))


@router.get("/contracts/{contract_id}/candidates")
def pack_candidates(
    contract_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(require_agency),
):
    """Tickets de funcionalidad del contrato que todavía no están en un pack."""
    _contract_for(db, contract_id, user)
    tickets = feature_packs.tickets_ready_for_pack(db, contract_id)
    return [
        {"id": ticket.id, "title": ticket.title, "status": ticket.status}
        for ticket in tickets
        if not ticket.packs
    ]


@router.post("", response_model=FeaturePackOut, status_code=status.HTTP_201_CREATED)
def create_pack(
    payload: FeaturePackCreate,
    db: Session = Depends(get_db),
    user: Users = Depends(require_agency),
):
    contract = _contract_for(db, payload.contract_id, user)
    if contract.state != "activo":
        raise HTTPException(
            status_code=409,
            detail="El contrato está archivado; no admite nuevos packs",
        )

    tickets = []
    for ticket_id in dict.fromkeys(payload.ticket_ids):
        ticket = db.get(Tickets, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} no existe")
        if ticket.contract_id != contract.id:
            raise HTTPException(
                status_code=400,
                detail=f"El ticket {ticket_id} no pertenece a este contrato",
            )
        if ticket.type is not TicketType.FUNCIONALIDAD:
            raise HTTPException(
                status_code=400,
                detail=f"El ticket {ticket_id} no es de tipo funcionalidad",
            )
        if ticket.packs:
            raise HTTPException(
                status_code=409,
                detail=f"El ticket {ticket_id} ya está en un pack",
            )
        tickets.append(ticket)

    pack = FeaturePacks(
        contract_id=contract.id,
        name=payload.name,
        description=payload.description,
        status=PackStatus.PROPUESTO,
        hours_estimated=payload.hours_estimated,
        price=payload.price,
        currency=payload.currency,
        created_by=user.id,
    )
    pack.tickets = tickets
    db.add(pack)
    db.commit()
    db.refresh(pack)

    notifications.notify(
        db,
        notifications.client_users(db, contract.application.client_id),
        NotificationType.PACK_PROPUESTO,
        f"Pack propuesto: {pack.name}",
        body="Tu equipo de soporte cotizó funcionalidades nuevas. Revisalo en el portal.",
        link=f"/feature-packs/{pack.id}",
        email=True,
    )
    db.commit()
    return feature_packs.serialize_pack(pack)


@router.put("/{pack_id}", response_model=FeaturePackOut)
def update_pack(
    pack_id: int,
    payload: FeaturePackUpdate,
    db: Session = Depends(get_db),
    user: Users = Depends(require_admin),
):
    pack = _get_pack(db, pack_id, user)
    if PackStatus(pack.status) not in (PackStatus.PROPUESTO, PackStatus.APROBADO):
        raise HTTPException(
            status_code=409,
            detail="Solo se puede editar un pack propuesto o aprobado",
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pack, field, value)
    db.commit()
    db.refresh(pack)
    return feature_packs.serialize_pack(pack)


@router.post("/{pack_id}/decision", response_model=FeaturePackOut)
def decide_pack(
    pack_id: int,
    payload: FeaturePackDecision,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    """El cliente (o admin) aprueba o rechaza un pack propuesto."""
    pack = _get_pack(db, pack_id, user)
    if PackStatus(pack.status) is not PackStatus.PROPUESTO:
        raise HTTPException(status_code=409, detail="El pack ya fue decidido")
    if not payload.approve and not (payload.reason or "").strip():
        raise HTTPException(
            status_code=400, detail="Indicá el motivo del rechazo"
        )

    pack.decided_by = user.id
    pack.decided_at = now_utc()
    if payload.approve:
        pack.status = PackStatus.APROBADO
        pack.approved_by = user.id
        pack.approved_at = pack.decided_at
        pack.rejection_reason = None
    else:
        pack.status = PackStatus.RECHAZADO
        pack.rejection_reason = payload.reason.strip()
    db.commit()
    db.refresh(pack)

    kind = (
        NotificationType.PACK_APROBADO if payload.approve else NotificationType.PACK_RECHAZADO
    )
    verb = "aprobado" if payload.approve else "rechazado"
    notifications.notify(
        db,
        notifications.agency_users(db),
        kind,
        f"Pack {verb}: {pack.name}",
        body=f"Decidido por {user.name}.",
        link=f"/feature-packs/{pack.id}",
        email=True,
    )
    db.commit()
    return feature_packs.serialize_pack(pack)


@router.post("/{pack_id}/status", response_model=FeaturePackOut)
def update_status(
    pack_id: int,
    payload: FeaturePackStatusUpdate,
    db: Session = Depends(get_db),
    user: Users = Depends(require_agency),
):
    pack = _get_pack(db, pack_id, user)
    target = payload.status
    if target is PackStatus.PROPUESTO:
        raise HTTPException(
            status_code=400, detail="Usá 'decision' para aprobar o rechazar"
        )
    if target in (PackStatus.APROBADO, PackStatus.RECHAZADO):
        raise HTTPException(
            status_code=400, detail="La aprobación la define el cliente"
        )

    moment = now_utc()
    if target is PackStatus.EN_DESARROLLO and PackStatus(pack.status) is not PackStatus.APROBADO:
        raise HTTPException(
            status_code=409, detail="Primero el pack debe estar aprobado"
        )
    if target is PackStatus.ENTREGADO and PackStatus(pack.status) is PackStatus.EN_DESARROLLO:
        pack.delivered_at = moment
    if target is PackStatus.FACTURADO:
        if PackStatus(pack.status) not in (PackStatus.ENTREGADO, PackStatus.EN_DESARROLLO):
            raise HTTPException(
                status_code=409, detail="El pack debe estar entregado antes de facturar"
            )
        pack.billed_at = moment

    pack.status = target
    db.commit()
    db.refresh(pack)
    return feature_packs.serialize_pack(pack)
