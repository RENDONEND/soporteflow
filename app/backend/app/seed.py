"""Semilla idempotente: planes por defecto, admin inicial y ciclos de banco."""

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.models import Plans, UserRole, Users
from app.services import hour_bank

DEFAULT_PLANS = [
    {
        "name": "Básico",
        "window_coverage": {
            "timezone": "America/Argentina/Buenos_Aires",
            "days": [0, 1, 2, 3, 4],
            "start_hour": 9,
            "end_hour": 18,
            "holidays": [],
        },
        "sla_by_severity": {"critico": 9, "alto": 18, "normal": 27, "bajo": 36},
        "response_sla_by_severity": {"critico": 4, "alto": 8, "normal": 12, "bajo": 24},
        "hours_bank_default": 30,
        "what_covers": ["Incidentes", "Mantenimiento preventivo básico"],
    },
    {
        "name": "Prioritario",
        "window_coverage": {
            "timezone": "America/Argentina/Buenos_Aires",
            "days": [0, 1, 2, 3, 4, 5],
            "start_hour": 8,
            "end_hour": 20,
            "holidays": [],
        },
        "sla_by_severity": {"critico": 4, "alto": 6, "normal": 12, "bajo": 24},
        "response_sla_by_severity": {"critico": 1, "alto": 2, "normal": 4, "bajo": 8},
        "hours_bank_default": 60,
        "what_covers": [
            "Incidentes",
            "Mantenimiento preventivo ampliado",
            "Soporte extendido Lun-Sáb",
        ],
    },
    {
        "name": "Premium",
        "window_coverage": {
            "timezone": "America/Argentina/Buenos_Aires",
            "days": [0, 1, 2, 3, 4, 5, 6],
            "start_hour": 0,
            "end_hour": 24,
            "holidays": [],
        },
        "sla_by_severity": {"critico": 1, "alto": 2, "normal": 4, "bajo": 8},
        "response_sla_by_severity": {"critico": 0.5, "alto": 1, "normal": 2, "bajo": 4},
        "hours_bank_default": 120,
        "what_covers": [
            "Incidentes 24/7",
            "Mantenimiento preventivo completo",
            "Monitoreo activo",
        ],
    },
]


def seed() -> None:
    db = SessionLocal()
    try:
        created_plans = []
        for data in DEFAULT_PLANS:
            existing = db.scalar(select(Plans).where(Plans.name == data["name"]))
            if existing is None:
                db.add(Plans(**data))
                created_plans.append(data["name"])
            elif existing.response_sla_by_severity is None:
                existing.response_sla_by_severity = data["response_sla_by_severity"]

        created_admin = False
        admin = db.scalar(select(Users).where(Users.email == settings.admin_email.lower()))
        if admin is None:
            db.add(
                Users(
                    email=settings.admin_email.lower(),
                    name="Admin",
                    role=UserRole.ADMIN,
                    hashed_password=hash_password(settings.admin_password),
                )
            )
            created_admin = True

        db.commit()
        bank = hour_bank.run_maintenance(db)
        db.commit()

        print(f"Planes creados: {', '.join(created_plans) or 'ninguno (ya existían)'}")
        print(
            f"Admin: {'creado' if created_admin else 'ya existía'} "
            f"({settings.admin_email.lower()})"
        )
        print(f"Banco de horas: {bank['closed']} ciclos cerrados, {bank['created']} creados")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
