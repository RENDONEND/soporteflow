from pydantic import BaseModel

class ClientCreate(BaseModel):
    name: str
    contacts: dict | None = None

class ClientOut(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True
