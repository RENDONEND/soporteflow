from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
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
    MaintenanceTasks,
    UserRole,
    Users,
)
from app.schemas.maintenance import (
    MaintenanceRunCreate,
    MaintenanceTaskCreate,
    MaintenanceTaskOut,
    MaintenanceTaskUpdate,
)
from app.services import hour_bank, maintenance
from app.services.tickets import ensure_utc

router = APIRouter(prefix="/maintenance-tasks", tags=["maintenance"])

ARCHIVED_DETAIL = "El contrato está archivado; no admite nuevos consumos"


def _get_task(db: Session, task_id: int, user: Users) -> MaintenanceTasks:
    task = db.get(MaintenanceTasks, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    ensure_client_access(user, task.contract.application.client_id)
    return task


@router.get("", response_model=list[MaintenanceTaskOut])
def list_tasks(
    contract_id: int | None = None,
    due: bool | None = None,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    query = select(MaintenanceTasks).order_by(MaintenanceTasks.name)
    if user.role is UserRole.CLIENTE:
        query = (
            query.join(Contracts)
            .join(Applications)
            .where(Applications.client_id == user.client_id)
        )
    if contract_id is not None:
        query = query.where(MaintenanceTasks.contract_id == contract_id)
    tasks = [maintenance.serialize_task(task, db) for task in db.scalars(query).all()]
    if due is not None:
        tasks = [task for task in tasks if task["due"] is due]
    return tasks


@router.get("/{task_id}", response_model=MaintenanceTaskOut)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    return maintenance.serialize_task(_get_task(db, task_id, user), db)


@router.post("", response_model=MaintenanceTaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: MaintenanceTaskCreate,
    db: Session = Depends(get_db),
    user: Users = Depends(require_agency),
):
    contract = db.get(Contracts, payload.contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    ensure_client_access(user, contract.application.client_id)
    task = MaintenanceTasks(
        contract_id=contract.id,
        name=payload.name,
        recurrence=payload.recurrence,
        checklist=payload.checklist,
        estimated_hours=payload.estimated_hours,
        active=payload.active,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return maintenance.serialize_task(task, db)


@router.put("/{task_id}", response_model=MaintenanceTaskOut)
def update_task(
    task_id: int,
    payload: MaintenanceTaskUpdate,
    db: Session = Depends(get_db),
    user: Users = Depends(require_agency),
):
    task = _get_task(db, task_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return maintenance.serialize_task(task, db)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(require_admin),
):
    task = _get_task(db, task_id, user)
    db.delete(task)
    db.commit()


@router.post("/{task_id}/runs", response_model=MaintenanceTaskOut)
def register_run(
    task_id: int,
    payload: MaintenanceRunCreate,
    db: Session = Depends(get_db),
    user: Users = Depends(require_agency),
):
    """Marca la tarea como hecha y descuenta las horas del banco del contrato."""
    task = _get_task(db, task_id, user)
    contract = task.contract
    if contract.state != "activo":
        raise HTTPException(status_code=409, detail=ARCHIVED_DETAIL)

    maintenance.complete(
        db,
        task,
        hours=payload.hours,
        user_id=user.id,
        notes=payload.notes,
        run_at=payload.run_at,
    )

    note = f"Mantenimiento: {task.name}"
    if payload.notes:
        note = f"{note}: {payload.notes}"
    try:
        hour_bank.consume(db, contract, payload.hours, note=note, user_id=user.id)
    except hour_bank.CycleClosedError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except hour_bank.HourBankError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    db.refresh(task)
    return maintenance.serialize_task(task, db)


@router.get("/contracts/{contract_id}/calendar")
def contract_calendar(
    contract_id: int,
    year: int = date.today().year,
    month: int = date.today().month,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    """Pendientes e historial de un contrato para el mes pedido (RF-61/RF-63)."""
    contract = db.get(Contracts, contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    ensure_client_access(user, contract.application.client_id)

    tasks = db.scalars(
        select(MaintenanceTasks)
        .where(MaintenanceTasks.contract_id == contract_id)
        .order_by(MaintenanceTasks.name)
    ).all()
    runs = maintenance.runs_for_month(db, contract_id, year, month)
    return {
        "contract_id": contract_id,
        "year": year,
        "month": month,
        "due_tasks": [
            maintenance.serialize_task(task, db)
            for task in tasks
            if maintenance.is_due(task)
        ],
        "month_hours": float(sum(float(run.hours or 0) for run in runs)),
        "runs": [
            {
                "id": run.id,
                "task_id": run.task_id,
                "task_name": run.task.name if run.task else None,
                "run_at": ensure_utc(run.run_at),
                "hours": float(run.hours or 0),
                "notes": run.notes,
                "user_name": run.user.name if run.user else None,
            }
            for run in runs
        ],
    }
