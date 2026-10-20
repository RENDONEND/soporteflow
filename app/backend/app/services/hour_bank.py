"""Banco de horas por contrato.

Regla de negocio: cada ciclo mensual asigna las horas del contrato y **no
arrastra remanente** al ciclo siguiente. El ciclo va desde `cut_date_day` de un
mes hasta el mismo día del mes siguiente (con ajuste en meses cortos).
"""

from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Contracts, HourBankAdjustments, HourBankCycles

ALERT_THRESHOLD_PERCENT = Decimal("20")


class HourBankError(Exception):
    """Error de negocio del banco de horas."""


class CycleClosedError(HourBankError):
    pass


def _decimal(value) -> Decimal:
    return Decimal(str(value or 0))


def _clamp_day(year: int, month: int, day: int) -> int:
    return min(day, monthrange(year, month)[1])


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def contract_timezone(contract: Contracts) -> ZoneInfo:
    return ZoneInfo(contract.timezone or "UTC")


def today_for(contract: Contracts) -> date:
    return datetime.now(contract_timezone(contract)).date()


def cycle_start(contract: Contracts, ref: date) -> date:
    cut_day = contract.cut_date_day or 1
    start = date(ref.year, ref.month, _clamp_day(ref.year, ref.month, cut_day))
    if ref < start:
        year, month = _shift_month(ref.year, ref.month, -1)
        start = date(year, month, _clamp_day(year, month, cut_day))
    return start


def cycle_end(contract: Contracts, start: date) -> date:
    """Primer día del ciclo siguiente (fecha de reinicio, exclusiva)."""
    cut_day = contract.cut_date_day or 1
    year, month = _shift_month(start.year, start.month, 1)
    return date(year, month, _clamp_day(year, month, cut_day))


def _get_or_create_cycle(
    db: Session, contract: Contracts, ref: date | None = None
) -> tuple[HourBankCycles, bool]:
    ref = ref or today_for(contract)
    start = cycle_start(contract, ref)
    month = start.strftime("%Y-%m")
    cycle = db.scalar(
        select(HourBankCycles).where(
            HourBankCycles.contract_id == contract.id,
            HourBankCycles.month == month,
        )
    )
    if cycle is not None:
        return cycle, False

    cycle = HourBankCycles(
        contract_id=contract.id,
        month=month,
        hours_assigned=_decimal(contract.hours_bank_month),
        hours_consumed=Decimal("0"),
        closed=False,
    )
    db.add(cycle)
    db.flush()
    return cycle, True


def ensure_cycle(db: Session, contract: Contracts, ref: date | None = None) -> HourBankCycles:
    cycle, _ = _get_or_create_cycle(db, contract, ref)
    return cycle


def _snapshot(contract: Contracts, cycle: HourBankCycles, start: date, end: date) -> dict:
    assigned = _decimal(cycle.hours_assigned)
    consumed = _decimal(cycle.hours_consumed)
    remaining = assigned - consumed
    percent_used = float((consumed / assigned * 100) if assigned > 0 else Decimal("100"))

    if remaining <= 0:
        alert = "agotado"
    elif assigned > 0 and remaining <= assigned * ALERT_THRESHOLD_PERCENT / 100:
        alert = "umbral"
    else:
        alert = "ok"

    return {
        "contract_id": contract.id,
        "cycle": cycle.month,
        "period_start": start,
        "period_end": end,
        "hours_assigned": float(assigned),
        "hours_consumed": float(consumed),
        "hours_remaining": float(remaining),
        "percent_used": round(percent_used, 1),
        "alert": alert,
        "closed": bool(cycle.closed),
    }


def get_bank(db: Session, contract: Contracts, ref: date | None = None) -> dict:
    cycle = ensure_cycle(db, contract, ref)
    start = cycle_start(contract, ref or today_for(contract))
    end = cycle_end(contract, start)
    return _snapshot(contract, cycle, start, end)


def consume(
    db: Session,
    contract: Contracts,
    hours: float,
    note: str | None = None,
    user_id: int | None = None,
    ref: date | None = None,
) -> dict:
    amount = _decimal(hours)
    if amount <= 0:
        raise HourBankError("Las horas a consumir deben ser mayores a 0")

    cycle = ensure_cycle(db, contract, ref)
    if cycle.closed:
        raise CycleClosedError("El ciclo ya está cerrado; no se puede imputar horas")

    cycle.hours_consumed = _decimal(cycle.hours_consumed) + amount
    db.add(
        HourBankAdjustments(
            contract_id=contract.id,
            cycle_id=cycle.id,
            user_id=user_id,
            hours=amount,
            note=note,
        )
    )
    db.flush()
    start = cycle_start(contract, ref or today_for(contract))
    return _snapshot(contract, cycle, start, cycle_end(contract, start))


def close_expired_cycles(db: Session, today: date | None = None) -> int:
    """Cierra los ciclos cuyo período terminó. No arrastra remanente."""
    today = today or date.today()
    closed = 0
    cycles = db.scalars(select(HourBankCycles).where(HourBankCycles.closed.is_(False))).all()
    for cycle in cycles:
        contract = db.get(Contracts, cycle.contract_id)
        if contract is None:
            continue
        year, month = (int(part) for part in cycle.month.split("-"))
        start = date(year, month, _clamp_day(year, month, contract.cut_date_day or 1))
        if cycle_end(contract, start) <= today:
            cycle.closed = True
            closed += 1
    db.flush()
    return closed


def ensure_active_cycles(db: Session, today: date | None = None) -> int:
    created = 0
    contracts = db.scalars(select(Contracts).where(Contracts.state == "activo")).all()
    for contract in contracts:
        _, was_created = _get_or_create_cycle(db, contract, today or today_for(contract))
        created += int(was_created)
    return created


def run_maintenance(db: Session, today: date | None = None) -> dict:
    """Tarea programada: cierra ciclos vencidos y prepara el ciclo vigente."""
    return {
        "closed": close_expired_cycles(db, today),
        "created": ensure_active_cycles(db, today),
    }


def reset_date(contract: Contracts, ref: date | None = None) -> date:
    return cycle_end(contract, cycle_start(contract, ref or today_for(contract)))


def history(db: Session, contract: Contracts) -> list[dict]:
    cycles = db.scalars(
        select(HourBankCycles)
        .where(HourBankCycles.contract_id == contract.id)
        .order_by(HourBankCycles.month.desc())
    ).all()
    result = []
    for cycle in cycles:
        year, month = (int(part) for part in cycle.month.split("-"))
        start = date(year, month, _clamp_day(year, month, contract.cut_date_day or 1))
        result.append(_snapshot(contract, cycle, start, cycle_end(contract, start)))
    return result
