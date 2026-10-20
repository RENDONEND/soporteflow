import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ADMIN_EMAIL", "admin@test.local")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.session import Base, get_db
from app.main import app
from app.models.models import Applications, Clients, Contracts, Plans, UserRole, Users

PASSWORD = "secreto-123"


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def api(db):
    def override():
        yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def plan(db):
    plan = Plans(
        name="Básico Test",
        window_coverage={
            "timezone": "UTC",
            "days": [0, 1, 2, 3, 4],
            "start_hour": 9,
            "end_hour": 18,
            "holidays": [],
        },
        sla_by_severity={"critico": 9, "alto": 18, "normal": 27, "bajo": 36},
        response_sla_by_severity={"critico": 4, "alto": 8, "normal": 12, "bajo": 24},
        hours_bank_default=30,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@pytest.fixture()
def scenario(db, api, plan):
    """Cliente A y B, cada uno con app + contrato, y usuarios de cada rol."""
    clients = {}
    contracts = {}
    for name in ("Cliente A", "Cliente B"):
        client = Clients(name=name, contacts={"email": f"{name[-1].lower()}@example.com"})
        db.add(client)
        db.flush()
        application = Applications(client_id=client.id, name=f"App {name}")
        db.add(application)
        db.flush()
        contract = Contracts(
            application_id=application.id,
            plan_id=plan.id,
            hours_bank_month=60,
            cut_date_day=1,
            hourly_rate_extra=50,
            timezone="UTC",
        )
        db.add(contract)
        db.flush()
        clients[name] = client.id
        contracts[name] = contract.id

    users = {
        "admin": Users(
            email="admin@test.local",
            name="Admin",
            role=UserRole.ADMIN,
            hashed_password=hash_password(PASSWORD),
        ),
        "tecnico": Users(
            email="tecnico@test.local",
            name="Técnico",
            role=UserRole.TECNICO,
            hashed_password=hash_password(PASSWORD),
        ),
        "cliente_a": Users(
            email="a@test.local",
            name="Cliente A",
            role=UserRole.CLIENTE,
            client_id=clients["Cliente A"],
            hashed_password=hash_password(PASSWORD),
        ),
        "cliente_b": Users(
            email="b@test.local",
            name="Cliente B",
            role=UserRole.CLIENTE,
            client_id=clients["Cliente B"],
            hashed_password=hash_password(PASSWORD),
        ),
    }
    db.add_all(users.values())
    db.commit()

    tokens = {}
    for key, user in users.items():
        response = api.post(
            "/api/auth/login", json={"email": user.email, "password": PASSWORD}
        )
        assert response.status_code == 200, response.text
        tokens[key] = response.json()["access_token"]

    return {
        "api": api,
        "db": db,
        "plan_id": plan.id,
        "clients": clients,
        "contracts": contracts,
        "tokens": tokens,
    }


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
