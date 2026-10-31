from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.models import NotificationType, Notifications, Users
from app.schemas.notification import NotificationList, NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationList)
def list_notifications(
    unread_only: bool = False,
    type_filter: NotificationType | None = Query(default=None, alias="type"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    query = select(Notifications).where(Notifications.user_id == user.id)
    if unread_only:
        query = query.where(Notifications.read.is_(False))
    if type_filter is not None:
        query = query.where(Notifications.type == type_filter)
    query = query.order_by(Notifications.created_at.desc()).limit(limit)
    items = db.scalars(query).all()
    unread = db.scalar(
        select(func.count())
        .select_from(Notifications)
        .where(Notifications.user_id == user.id, Notifications.read.is_(False))
    )
    return NotificationList(unread=unread or 0, items=items)


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    notification = db.get(Notifications, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    notification.read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/read-all", response_model=NotificationList)
def mark_all_read(
    db: Session = Depends(get_db),
    user: Users = Depends(get_current_user),
):
    for notification in db.scalars(
        select(Notifications).where(
            Notifications.user_id == user.id, Notifications.read.is_(False)
        )
    ).all():
        notification.read = True
    db.commit()
    items = db.scalars(
        select(Notifications)
        .where(Notifications.user_id == user.id)
        .order_by(Notifications.created_at.desc())
        .limit(50)
    ).all()
    unread = db.scalar(
        select(func.count())
        .select_from(Notifications)
        .where(Notifications.user_id == user.id, Notifications.read.is_(False))
    )
    return NotificationList(unread=unread or 0, items=items)
