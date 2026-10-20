from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import ensure_client_access, get_current_user, require_admin
from app.db.session import get_db
from app.models.models import Clients, UserRole, Users
from app.schemas.client import ClientCreate, ClientOut, ClientUpdate

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientOut])
def list_clients(
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    if user.role is UserRole.CLIENTE:
        return db.scalars(select(Clients).where(Clients.id == user.client_id)).all()
    return db.scalars(select(Clients).order_by(Clients.name)).all()


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    client = Clients(name=payload.name, contacts=payload.contacts)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientOut)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    ensure_client_access(user, client_id)
    client = db.get(Clients, client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client


@router.put("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    payload: ClientUpdate,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    client = db.get(Clients, client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    client.name = payload.name
    client.contacts = payload.contacts
    db.commit()
    db.refresh(client)
    return client
