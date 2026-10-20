from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Clients
from app.schemas.client import ClientCreate, ClientOut

router = APIRouter(prefix="/clients", tags=["clients"])

@router.get("/", response_model=list[ClientOut])
def list_clients(db: Session = Depends(get_db)):
    return db.query(Clients).all()

@router.post("/", response_model=ClientOut)
def create_client(payload: ClientCreate, db: Session = Depends(get_db)):
    c = Clients(name=payload.name, contacts=payload.contacts)
    db.add(c); db.commit(); db.refresh(c)
    return c
