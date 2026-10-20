from datetime import datetime, timedelta
import zoneinfo

def is_working_time(dt: datetime, window: dict) -> bool:
    tz = zoneinfo.ZoneInfo(window.get("timezone", "UTC"))
    local = dt.astimezone(tz)
    weekday = local.weekday()  # 0 Mon
    hour = local.hour
    days = window.get("days", list(range(5)))
    start = window.get("start_hour", 9)
    end = window.get("end_hour", 18)
    return weekday in days and start <= hour < end

def add_working_hours(start: datetime, hours: float, window: dict) -> datetime:
    # Simplified for MVP: add hours directly
    return start + timedelta(hours=hours)

def calcular_vencimiento(fecha_apertura: datetime, severidad: str, plan: dict) -> datetime:
    sla_map = plan.get("sla_by_severity", {})
    hours = sla_map.get(severidad, 72)
    window = plan.get("window_coverage", {})
    # if opened outside window, move to start of window
    if not is_working_time(fecha_apertura, window):
        # move to next working start
        tz = zoneinfo.ZoneInfo(window.get("timezone","UTC"))
        candidate = fecha_apertura.astimezone(tz)
        # find next working start
        while not is_working_time(candidate, window):
            candidate += timedelta(hours=1)
        fecha_apertura = candidate
    return add_working_hours(fecha_apertura, hours, window)
