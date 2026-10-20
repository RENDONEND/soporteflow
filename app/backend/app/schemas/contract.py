from datetime import date
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.application import ApplicationWithClient
from app.schemas.plan import PlanSummary


class ContractBase(BaseModel):
    plan_id: int
    hours_bank_month: float = Field(gt=0)
    cut_date_day: int = Field(default=1, ge=1, le=28)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    hourly_rate_extra: float = Field(default=0, ge=0)
    timezone: str = "America/Argentina/Buenos_Aires"
    state: Literal["activo", "archivado"] = "activo"

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"Zona horaria desconocida: {value}") from None
        return value

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()


class ContractCreate(ContractBase):
    pass


class ContractUpdate(ContractBase):
    pass


class ContractOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    plan_id: int
    hours_bank_month: float
    cut_date_day: int
    currency: str
    hourly_rate_extra: float
    timezone: str
    state: str
    plan: PlanSummary | None = None
    application: ApplicationWithClient | None = None


class HourBankOut(BaseModel):
    contract_id: int
    cycle: str
    period_start: date
    period_end: date
    hours_assigned: float
    hours_consumed: float
    hours_remaining: float
    percent_used: float
    alert: Literal["ok", "umbral", "agotado"]
    closed: bool


class ConsumeHoursRequest(BaseModel):
    hours: float = Field(gt=0)
    note: str | None = Field(default=None, max_length=500)
