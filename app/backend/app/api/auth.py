from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, get_current_user, verify_password
from app.db.session import get_db
from app.models.models import Users
from app.schemas.user import LoginRequest, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.scalar(select(Users).where(Users.email == email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenOut(
        access_token=create_access_token(user),
        expires_in=settings.access_token_expire_minutes * 60,
        user=user,
    )


@router.get("/me", response_model=UserOut)
def me(user: Users = Depends(get_current_user)):
    return user
