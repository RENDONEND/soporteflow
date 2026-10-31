from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import ensure_client_access, get_current_user, require_admin
from app.db.session import get_db
from app.models.models import Applications, Clients, UserRole, Users
from app.schemas.application import (
    ApplicationCreate,
    ApplicationOut,
    ApplicationUpdate,
    ApplicationWithClient,
)

router = APIRouter(tags=["applications"])


@router.get("/applications", response_model=list[ApplicationWithClient])
def list_applications(
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    query = select(Applications).order_by(Applications.name)
    if user.role is UserRole.CLIENTE:
        query = query.join(Clients).where(Clients.id == user.client_id)
    return db.scalars(query).all()


@router.get("/clients/{client_id}/applications", response_model=list[ApplicationOut])
def list_client_applications(
    client_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    ensure_client_access(user, client_id)
    if db.get(Clients, client_id) is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return db.scalars(
        select(Applications)
        .where(Applications.client_id == client_id)
        .order_by(Applications.name)
    ).all()


@router.post(
    "/clients/{client_id}/applications",
    response_model=ApplicationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_application(
    client_id: int,
    payload: ApplicationCreate,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    if db.get(Clients, client_id) is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    application = Applications(
        client_id=client_id, name=payload.name, description=payload.description
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


@router.get("/applications/{application_id}", response_model=ApplicationWithClient)
def get_application(
    application_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    application = db.get(Applications, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")
    ensure_client_access(user, application.client_id)
    return application


@router.put("/applications/{application_id}", response_model=ApplicationOut)
def update_application(
    application_id: int,
    payload: ApplicationUpdate,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    application = db.get(Applications, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")
    application.name = payload.name
    application.description = payload.description
    db.commit()
    db.refresh(application)
    return application
