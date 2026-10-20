from fastapi import APIRouter
router = APIRouter(prefix="/contracts", tags=["contracts"])
@router.get("/")
def list_contracts(): return {"message":"contracts stub"}
