from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.models import UserRole


class UserBase(BaseModel):
    email: str = Field(min_length=5, max_length=160)
    name: str = Field(min_length=1, max_length=120)
    role: UserRole
    client_id: int | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("Email inválido")
        return value

    @field_validator("client_id")
    @classmethod
    def client_role_consistency(cls, value: int | None, info):
        role = info.data.get("role")
        if role is UserRole.CLIENTE and value is None:
            raise ValueError("Un usuario cliente debe tener client_id")
        if role in (UserRole.ADMIN, UserRole.TECNICO) and value is not None:
            raise ValueError("Un usuario de agencia no puede tener client_id")
        return value


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role: UserRole
    client_id: int | None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
