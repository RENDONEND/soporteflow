from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.models import TicketSeverity, TicketStatus, TicketType


class TicketCreate(BaseModel):
    contract_id: int
    type: TicketType
    severity: TicketSeverity | None = None
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=8000)

    @model_validator(mode="after")
    def validate_severity(self):
        if self.type is TicketType.SOPORTE and self.severity is None:
            raise ValueError("Un ticket de soporte necesita severidad")
        if self.type is TicketType.FUNCIONALIDAD and self.severity is not None:
            raise ValueError("Un ticket de funcionalidad no lleva severidad")
        return self


class TicketUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=8000)
    status: TicketStatus | None = None
    severity: TicketSeverity | None = None
    assigned_to: int | None = None


class TicketCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    internal: bool = False


class TicketTimeLogCreate(BaseModel):
    hours: float = Field(gt=0, le=24)
    note: str | None = Field(default=None, max_length=500)


class TicketCommentOut(BaseModel):
    id: int
    body: str
    internal: bool
    created_at: datetime | None
    user_name: str | None


class TicketTimeLogOut(BaseModel):
    id: int
    hours: float
    logged_at: datetime | None
    note: str | None
    user_name: str | None


class TicketAttachmentOut(BaseModel):
    id: int
    filename: str
    content_type: str | None
    size: int
    created_at: datetime | None
    user_name: str | None


class TicketOut(BaseModel):
    id: int
    contract_id: int
    client_id: int
    client_name: str
    application_name: str
    plan_name: str
    timezone: str
    type: TicketType
    severity: TicketSeverity | None
    status: TicketStatus
    title: str
    description: str | None
    assigned_to: int | None
    assigned_to_name: str | None
    created_by: int | None
    created_by_name: str | None
    opened_at: datetime | None
    response_deadline: datetime | None
    resolution_deadline: datetime | None
    first_response_at: datetime | None
    resolved_at: datetime | None
    response_state: str
    resolution_state: str
    is_overdue: bool
    hours_logged: float
    comments: list[TicketCommentOut] = Field(default_factory=list)
    time_logs: list[TicketTimeLogOut] = Field(default_factory=list)
    attachments: list[TicketAttachmentOut] = Field(default_factory=list)
