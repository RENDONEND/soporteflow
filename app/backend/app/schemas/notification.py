from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.models import NotificationType


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: NotificationType
    title: str
    body: str | None = None
    link: str | None = None
    read: bool
    email_sent: bool
    created_at: datetime | None = None


class NotificationList(BaseModel):
    unread: int
    items: list[NotificationOut]
