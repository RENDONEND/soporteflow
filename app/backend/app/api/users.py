from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, require_admin
from app.db.session import get_db
from app.models.models import Clients, UserRole, Users
from app.schemas.user import UserCreate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    return db.scalars(select(Users).order_by(Users.email)).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    existing = db.scalar(select(Users).where(Users.email == payload.email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email")
    if payload.role is UserRole.CLIENTE and db.get(Clients, payload.client_id) is None:
        raise HTTPException(status_code=404, detail="El cliente indicado no existe")

    user = Users(
        email=payload.email,
        name=payload.name,
        role=payload.role,
        client_id=payload.client_id,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
