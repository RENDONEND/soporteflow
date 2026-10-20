from pydantic import BaseModel, ConfigDict, Field

from app.schemas.client import ClientSummary


class ApplicationBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationUpdate(ApplicationBase):
    pass


class ApplicationOut(ApplicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int


class ApplicationWithClient(ApplicationOut):
    client: ClientSummary
