from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import ensure_client_access, get_current_user, require_admin
from app.db.session import get_db
from app.models.models import Applications, Contracts, Plans, UserRole, Users
from app.schemas.contract import ContractCreate, ContractOut, ContractUpdate

router = APIRouter(tags=["contracts"])


def _get_contract(db: Session, contract_id: int) -> Contracts:
    contract = db.get(Contracts, contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    return contract


@router.get("/contracts", response_model=list[ContractOut])
def list_contracts(
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    query = select(Contracts).order_by(Contracts.id)
    if user.role is UserRole.CLIENTE:
        query = query.join(Applications).where(Applications.client_id == user.client_id)
    return db.scalars(query).all()


@router.get("/applications/{application_id}/contracts", response_model=list[ContractOut])
def list_application_contracts(
    application_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    application = db.get(Applications, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")
    ensure_client_access(user, application.client_id)
    return db.scalars(
        select(Contracts).where(Contracts.application_id == application_id)
    ).all()


@router.post(
    "/applications/{application_id}/contracts",
    response_model=ContractOut,
    status_code=status.HTTP_201_CREATED,
)
def create_contract(
    application_id: int,
    payload: ContractCreate,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    if db.get(Applications, application_id) is None:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")
    if db.get(Plans, payload.plan_id) is None:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    active = db.scalar(
        select(Contracts).where(
            Contracts.application_id == application_id,
            Contracts.state == "activo",
        )
    )
    if active is not None:
        raise HTTPException(
            status_code=409,
            detail="La aplicación ya tiene un contrato activo; archivá el anterior primero",
        )

    contract = Contracts(application_id=application_id, **payload.model_dump())
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


@router.get("/contracts/{contract_id}", response_model=ContractOut)
def get_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    contract = _get_contract(db, contract_id)
    ensure_client_access(user, contract.application.client_id)
    return contract


@router.put("/contracts/{contract_id}", response_model=ContractOut)
def update_contract(
    contract_id: int,
    payload: ContractUpdate,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    contract = _get_contract(db, contract_id)
    if db.get(Plans, payload.plan_id) is None:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    for field, value in payload.model_dump().items():
        setattr(contract, field, value)
    db.commit()
    db.refresh(contract)
    return contract
