"""Motor de SLA.

Los tiempos de respuesta de un plan se expresan en **horas de cobertura**: solo
corre el reloj dentro de la ventana del plan (días y horario), y se saltan
feriados. Un plan 24/7 equivale a horas de reloj.

Ejemplo: Básico (Lun-Vie 9-18) con SLA normal de 27 h de cobertura equivale a
3 días hábiles completos.
"""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

DEFAULT_TIMEZONE = "UTC"
DEFAULT_DAYS = [0, 1, 2, 3, 4]
DEFAULT_START = 9
DEFAULT_END = 18
DEFAULT_SLA_HOURS = 72.0


def _timezone(window: dict) -> ZoneInfo:
    return ZoneInfo(window.get("timezone", DEFAULT_TIMEZONE))


def _start_minutes(window: dict) -> int:
    return int(window.get("start_hour", DEFAULT_START)) * 60


def _end_minutes(window: dict) -> int:
    return int(window.get("end_hour", DEFAULT_END)) * 60


def _holidays(window: dict) -> set[date]:
    return {date.fromisoformat(item) for item in window.get("holidays", [])}


def _minutes_of_day(local: datetime) -> int:
    return local.hour * 60 + local.minute


def is_working_day(day: date, window: dict) -> bool:
    days = window.get("days", DEFAULT_DAYS)
    return day.weekday() in days and day not in _holidays(window)


def is_working_time(dt: datetime, window: dict) -> bool:
    local = dt.astimezone(_timezone(window))
    return is_working_day(local.date(), window) and _start_minutes(window) <= _minutes_of_day(
        local
    ) < _end_minutes(window)


def _start_of_day(day: date, window: dict) -> datetime:
    return datetime.combine(day, time(0), tzinfo=_timezone(window)) + timedelta(
        minutes=_start_minutes(window)
    )


def _end_of_day(day: date, window: dict) -> datetime:
    return datetime.combine(day, time(0), tzinfo=_timezone(window)) + timedelta(
        minutes=_end_minutes(window)
    )


def _next_working_start(moment: datetime, window: dict) -> datetime:
    """Primer instante de cobertura >= `moment`."""
    local = moment.astimezone(_timezone(window))
    if is_working_time(local, window):
        return local

    day = local.date()
    if is_working_day(day, window) and _minutes_of_day(local) < _start_minutes(window):
        return _start_of_day(day, window)

    day += timedelta(days=1)
    for _ in range(3660):
        if is_working_day(day, window):
            return _start_of_day(day, window)
        day += timedelta(days=1)
    raise ValueError("No se encontró una ventana de cobertura en el próximo año")


def coverage_hours_per_day(window: dict) -> float:
    return (_end_minutes(window) - _start_minutes(window)) / 60


def add_working_hours(start: datetime, hours: float, window: dict) -> datetime:
    """Suma horas de cobertura a `start` y devuelve el instante en UTC."""
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if hours <= 0:
        return start.astimezone(timezone.utc)

    remaining = float(hours)
    cursor = _next_working_start(start, window)
    tz = _timezone(window)

    for _ in range(20000):  # tope de seguridad (~55 años de días laborables)
        local = cursor.astimezone(tz)
        end_of_day = _end_of_day(local.date(), window)
        available = (end_of_day - local).total_seconds() / 3600
        if remaining <= available:
            return (local + timedelta(hours=remaining)).astimezone(timezone.utc)
        remaining -= available
        next_day = local.date() + timedelta(days=1)
        cursor = _start_of_day(next_day, window)
        while not is_working_day(cursor.date(), window):
            cursor = _start_of_day(cursor.date() + timedelta(days=1), window)

    raise ValueError("El SLA es demasiado grande para calcularlo")


def calcular_vencimiento(fecha_apertura: datetime, severidad: str, plan: dict) -> datetime:
    """Fecha límite de primera respuesta/resolución, en UTC."""
    sla_map = plan.get("sla_by_severity", {}) or {}
    hours = sla_map.get(severidad, DEFAULT_SLA_HOURS)
    window = plan.get("window_coverage", {}) or {}
    return add_working_hours(fecha_apertura, float(hours), window)
