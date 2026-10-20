from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_admin
from app.db.session import get_db
from app.models.models import Plans, Users
from app.schemas.plan import PlanCreate, PlanOut, PlanUpdate

router = APIRouter(prefix="/plans", tags=["plans"])


def _get_plan(db: Session, plan_id: int) -> Plans:
    plan = db.get(Plans, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return plan


def _payload_to_model(payload: PlanCreate | PlanUpdate) -> dict:
    data = payload.model_dump()
    data["window_coverage"] = payload.window_coverage.model_dump()
    return data


@router.get("", response_model=list[PlanOut])
def list_plans(
    db: Session = Depends(get_db),
    _: Users = Depends(get_current_user),
):
    return db.scalars(select(Plans).order_by(Plans.id)).all()


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: PlanCreate,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    plan = Plans(**_payload_to_model(payload))
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/{plan_id}", response_model=PlanOut)
def get_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    _: Users = Depends(get_current_user),
):
    return _get_plan(db, plan_id)


@router.put("/{plan_id}", response_model=PlanOut)
def update_plan(
    plan_id: int,
    payload: PlanUpdate,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    plan = _get_plan(db, plan_id)
    for field, value in _payload_to_model(payload).items():
        setattr(plan, field, value)
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/{plan_id}/duplicate", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def duplicate_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    _: Users = Depends(require_admin),
):
    source = _get_plan(db, plan_id)
    copy = Plans(
        name=f"{source.name} (copia)",
        window_coverage=source.window_coverage,
        sla_by_severity=source.sla_by_severity,
        response_sla_by_severity=source.response_sla_by_severity,
        hours_bank_default=source.hours_bank_default,
        what_covers=source.what_covers,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy
