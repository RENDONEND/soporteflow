from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Plans

router = APIRouter(prefix="/plans", tags=["plans"])

@router.get("/")
def list_plans(db: Session = Depends(get_db)):
    return db.query(Plans).all()

@router.post("/")
def create_plan(name: str, window_coverage: dict, sla_by_severity: dict, hours_bank_default: int, db: Session = Depends(get_db)):
    p = Plans(name=name, window_coverage=window_coverage, sla_by_severity=sla_by_severity, hours_bank_default=hours_bank_default)
    db.add(p); db.commit(); db.refresh(p)
    return p
