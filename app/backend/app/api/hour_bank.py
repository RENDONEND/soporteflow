from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import ensure_client_access, get_current_user, require_agency
from app.db.session import get_db
from app.models.models import Contracts, Users
from app.schemas.contract import ConsumeHoursRequest, HourBankOut
from app.services import hour_bank

router = APIRouter(prefix="/contracts/{contract_id}/hour-bank", tags=["hour-bank"])


def _contract_for(db: Session, contract_id: int, user: Users) -> Contracts:
    contract = db.get(Contracts, contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    ensure_client_access(user, contract.application.client_id)
    return contract


@router.get("", response_model=HourBankOut)
def get_hour_bank(
    contract_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    contract = _contract_for(db, contract_id, user)
    return hour_bank.get_bank(db, contract)


@router.get("/history", response_model=list[HourBankOut])
def get_hour_bank_history(
    contract_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    contract = _contract_for(db, contract_id, user)
    return hour_bank.history(db, contract)


@router.post("/consume", response_model=HourBankOut)
def consume_hours(
    contract_id: int,
    payload: ConsumeHoursRequest,
    db: Session = Depends(get_db),
    user: Users = Depends(require_agency),
):
    contract = _contract_for(db, contract_id, user)
    try:
        result = hour_bank.consume(
            db,
            contract,
            payload.hours,
            note=payload.note,
            user_id=user.id,
        )
    except hour_bank.CycleClosedError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except hour_bank.HourBankError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    return result
