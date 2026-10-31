from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.models import MaintenanceRecurrence


class MaintenanceTaskBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    recurrence: MaintenanceRecurrence = MaintenanceRecurrence.MENSUAL
    checklist: list[str] = Field(default_factory=list)
    estimated_hours: float | None = Field(default=None, gt=0)
    active: bool = True


class MaintenanceTaskCreate(MaintenanceTaskBase):
    contract_id: int


class MaintenanceTaskUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    recurrence: MaintenanceRecurrence | None = None
    checklist: list[str] | None = None
    estimated_hours: float | None = Field(default=None, gt=0)
    active: bool | None = None


class MaintenanceRunCreate(BaseModel):
    hours: float = Field(gt=0)
    notes: str | None = None
    run_at: datetime | None = None


class MaintenanceRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    run_at: datetime | None = None
    hours: float
    notes: str | None = None
    user_name: str | None = None


class MaintenanceTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int
    client_id: int | None = None
    client_name: str | None = None
    application_name: str | None = None
    name: str
    recurrence: MaintenanceRecurrence
    checklist: list[str] = Field(default_factory=list)
    estimated_hours: float | None = None
    active: bool
    last_run_at: datetime | None = None
    last_run_by: str | None = None
    next_due_at: datetime | None = None
    due: bool = False
    overdue: bool = False
    runs: list[MaintenanceRunOut] = Field(default_factory=list)
