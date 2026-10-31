from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.models import PackStatus


class FeaturePackBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    hours_estimated: float = Field(gt=0)
    price: float = Field(ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)


class FeaturePackCreate(FeaturePackBase):
    contract_id: int
    ticket_ids: list[int] = Field(default_factory=list)

    def validate_tickets(self) -> None:
        if not self.ticket_ids:
            raise ValueError("Un pack necesita al menos un ticket de funcionalidad")


class FeaturePackUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = None
    hours_estimated: float | None = Field(default=None, gt=0)
    price: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)


class FeaturePackDecision(BaseModel):
    approve: bool
    reason: str | None = None


class FeaturePackTicketOut(BaseModel):
    id: int
    title: str
    status: str
    hours_logged: float


class FeaturePackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int
    client_id: int | None = None
    client_name: str | None = None
    application_name: str | None = None
    name: str
    description: str | None = None
    status: PackStatus
    hours_estimated: float
    hours_real: float
    price: float
    currency: str
    created_at: datetime | None = None
    decided_at: datetime | None = None
    decided_by_name: str | None = None
    approved_at: datetime | None = None
    approved_by_name: str | None = None
    delivered_at: datetime | None = None
    billed_at: datetime | None = None
    rejection_reason: str | None = None
    ticket_ids: list[int] = Field(default_factory=list)
    tickets: list[FeaturePackTicketOut] = Field(default_factory=list)


class FeaturePackStatusUpdate(BaseModel):
    status: PackStatus
