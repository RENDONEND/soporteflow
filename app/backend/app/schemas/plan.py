from datetime import date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SEVERITIES = ("critico", "alto", "normal", "bajo")


class CoverageWindow(BaseModel):
    timezone: str = "America/Argentina/Buenos_Aires"
    days: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])
    start_hour: int = 9
    end_hour: int = 18
    holidays: list[str] = Field(default_factory=list)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"Zona horaria desconocida: {value}") from None
        return value

    @field_validator("days")
    @classmethod
    def validate_days(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("La ventana debe cubrir al menos un día")
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("Los días van de 0 (lunes) a 6 (domingo)")
        return sorted(set(value))

    @field_validator("holidays")
    @classmethod
    def validate_holidays(cls, value: list[str]) -> list[str]:
        for item in value:
            try:
                date.fromisoformat(item)
            except ValueError:
                raise ValueError(f"Fecha de feriado inválida: {item} (usar YYYY-MM-DD)") from None
        return value

    @model_validator(mode="after")
    def validate_hours(self):
        if not 0 <= self.start_hour < self.end_hour <= 24:
            raise ValueError("Se requiere 0 <= start_hour < end_hour <= 24")
        return self


def validate_sla_map(value: dict[str, float]) -> dict[str, float]:
    if not value:
        raise ValueError("Definí al menos un tiempo de respuesta por severidad")
    unknown = set(value) - set(SEVERITIES)
    if unknown:
        raise ValueError(f"Severidades inválidas: {', '.join(sorted(unknown))}")
    for severity, hours in value.items():
        if hours <= 0:
            raise ValueError(f"El SLA de '{severity}' debe ser mayor a 0")
    return value


class PlanBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    window_coverage: CoverageWindow
    sla_by_severity: dict[str, float]
    response_sla_by_severity: dict[str, float] | None = None
    hours_bank_default: float = Field(gt=0)
    what_covers: list[str] | None = None

    @field_validator("sla_by_severity")
    @classmethod
    def check_sla(cls, value: dict[str, float]) -> dict[str, float]:
        return validate_sla_map(value)

    @field_validator("response_sla_by_severity")
    @classmethod
    def check_response_sla(
        cls, value: dict[str, float] | None
    ) -> dict[str, float] | None:
        if value is None:
            return None
        return validate_sla_map(value)


class PlanCreate(PlanBase):
    pass


class PlanUpdate(PlanBase):
    pass


class PlanOut(PlanBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class PlanSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    window_coverage: dict
    sla_by_severity: dict
    response_sla_by_severity: dict | None = None
