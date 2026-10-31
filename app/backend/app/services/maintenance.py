"""Mantenimiento preventivo.

Tareas recurrentes por contrato. Al completar una ejecución se registran horas
que **descuentan del banco** igual que un ticket de soporte, y el historial
queda visible para el cliente como evidencia del trabajo hecho.
"""

from calendar import monthrange
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import (
    MaintenanceRecurrence,
    MaintenanceRuns,
    MaintenanceTasks,
)
from app.services.tickets import ensure_utc

RECURRENCE_DAYS = {
    MaintenanceRecurrence.SEMANAL.value: 7,
    MaintenanceRecurrence.MENSUAL.value: 30,
    MaintenanceRecurrence.TRIMESTRAL.value: 90,
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def recurrence_days(recurrence) -> int:
    value = recurrence.value if hasattr(recurrence, "value") else str(recurrence)
    return RECURRENCE_DAYS.get(value, 30)


def _add_days(moment: datetime, days: int) -> datetime:
    return moment + timedelta(days=days)


def next_due_at(task: MaintenanceTasks) -> datetime:
    base = ensure_utc(task.last_run_at) or ensure_utc(task.created_at) or now_utc()
    return _add_days(base, recurrence_days(task.recurrence))


def is_due(task: MaintenanceTasks, now: datetime | None = None) -> bool:
    if not task.active:
        return False
    return next_due_at(task) <= (now or now_utc())


def last_runs(db: Session, task: MaintenanceTasks, limit: int = 3) -> list[MaintenanceRuns]:
    return list(
        db.scalars(
            select(MaintenanceRuns)
            .where(MaintenanceRuns.task_id == task.id)
            .order_by(MaintenanceRuns.run_at.desc())
            .limit(limit)
        ).all()
    )


def serialize_task(task: MaintenanceTasks, db: Session, now: datetime | None = None) -> dict:
    now = now or now_utc()
    due_at = next_due_at(task)
    runs = last_runs(db, task, limit=5)
    completed = [run for run in runs if run.run_at is not None]
    return {
        "id": task.id,
        "contract_id": task.contract_id,
        "client_id": task.contract.application.client_id,
        "client_name": task.contract.application.client.name,
        "application_name": task.contract.application.name,
        "name": task.name,
        "recurrence": task.recurrence,
        "checklist": task.checklist or [],
        "estimated_hours": float(task.estimated_hours) if task.estimated_hours else None,
        "active": task.active,
        "last_run_at": ensure_utc(task.last_run_at),
        "last_run_by": (
            completed[0].user.name if completed and completed[0].user else None
        ),
        "next_due_at": due_at,
        "due": is_due(task, now),
        "overdue": is_due(task, now) and due_at <= now,
        "runs": [
            {
                "id": run.id,
                "run_at": ensure_utc(run.run_at),
                "hours": float(run.hours or 0),
                "notes": run.notes,
                "user_name": run.user.name if run.user else None,
            }
            for run in runs
        ],
    }


def runs_for_month(db: Session, contract_id: int, year: int, month: int) -> list[MaintenanceRuns]:
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return list(
        db.scalars(
            select(MaintenanceRuns)
            .join(MaintenanceTasks, MaintenanceRuns.task_id == MaintenanceTasks.id)
            .where(
                MaintenanceTasks.contract_id == contract_id,
                MaintenanceRuns.run_at >= start,
                MaintenanceRuns.run_at < end,
            )
            .order_by(MaintenanceRuns.run_at.desc())
        ).all()
    )


def last_day_of(reference: datetime) -> int:
    return monthrange(reference.year, reference.month)[1]


def overdue_tasks(db: Session, now: datetime | None = None) -> list[MaintenanceTasks]:
    now = now or now_utc()
    tasks = db.scalars(
        select(MaintenanceTasks).where(MaintenanceTasks.active.is_(True))
    ).all()
    return [task for task in tasks if is_due(task, now)]


def complete(
    db: Session,
    task: MaintenanceTasks,
    hours: float,
    user_id: int | None = None,
    notes: str | None = None,
    run_at: datetime | None = None,
) -> MaintenanceRuns:
    """Registra una ejecución. Las horas se imputan al banco del contrato."""
    moment = ensure_utc(run_at) or now_utc()
    run = MaintenanceRuns(
        task_id=task.id,
        run_at=moment,
        completed_by=user_id,
        hours=hours,
        notes=notes,
    )
    db.add(run)
    task.last_run_at = moment
    db.flush()
    return run


def notify_maintenance_due(db: Session, now: datetime | None = None) -> int:
    """Recuerda a la agencia las tareas de mantenimiento vencidas (RF-62)."""
    from app.models.models import NotificationType, Notifications
    from app.services import notifications

    sent = 0
    agency = notifications.agency_users(db)
    if not agency:
        return 0
    for task in overdue_tasks(db, now):
        link = f"/contracts/{task.contract_id}"
        for user in agency:
            existing = db.scalar(
                select(Notifications).where(
                    Notifications.user_id == user.id,
                    Notifications.type == NotificationType.MANTENIMIENTO_PENDIENTE,
                    Notifications.link == link,
                )
            )
            if existing is not None:
                continue
            notifications.notify(
                db,
                [user],
                NotificationType.MANTENIMIENTO_PENDIENTE,
                f"Mantenimiento pendiente: {task.name}",
                body=(
                    f"{task.contract.application.client.name} · "
                    f"{task.contract.application.name}"
                ),
                link=link,
            )
            sent += 1
    return sent
