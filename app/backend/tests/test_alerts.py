from datetime import datetime, timedelta, timezone

from app.models.models import NotificationType, Notifications, Tickets
from app.services import alerts, hour_bank

from .conftest import auth


def test_bank_alert_notifies_agency_and_client(scenario, db):
    contract_id = scenario["contracts"]["Cliente A"]
    contract = hour_bank_contract(scenario, db)
    hour_bank.consume(db, contract, 55)  # deja 5 h de 60 → umbral
    db.commit()

    sent = alerts.notify_bank_alerts(db)
    db.commit()
    assert sent["umbral"] >= 1

    client = scenario["api"].get(
        "/api/notifications", headers=auth(scenario["tokens"]["cliente_a"])
    ).json()
    assert any(item["type"] == "banco_umbral" for item in client["items"])


def test_bank_alert_is_not_duplicated(scenario, db):
    contract = hour_bank_contract(scenario, db)
    hour_bank.consume(db, contract, 55)
    db.commit()

    alerts.notify_bank_alerts(db)
    db.commit()
    second = alerts.notify_bank_alerts(db)
    db.commit()
    assert second["umbral"] == 0


def test_sla_alert_notifies_agency_once(scenario, db):
    ticket = scenario["api"].post(
        "/api/tickets",
        json={
            "contract_id": scenario["contracts"]["Cliente A"],
            "type": "soporte",
            "severity": "critico",
            "title": "Caída total",
        },
        headers=auth(scenario["tokens"]["cliente_a"]),
    ).json()

    row = db.get(Tickets, ticket["id"])
    row.sla_deadline = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()

    from app.services.sla_monitor import check_sla

    report = check_sla(db)
    assert ticket["id"] in report["breached"]

    first = alerts.notify_sla_alerts(db, report)
    db.commit()
    assert first["breached"] >= 1

    second = alerts.notify_sla_alerts(db, report)
    db.commit()
    assert second["breached"] == 0


def hour_bank_contract(scenario, db):
    from app.models.models import Contracts

    return db.get(Contracts, scenario["contracts"]["Cliente A"])


def test_notification_type_enum_has_new_values():
    assert NotificationType.PACK_PROPUESTO.value == "pack_propuesto"
    assert NotificationType.MANTENIMIENTO_PENDIENTE.value == "mantenimiento_pendiente"
    assert Notifications.__tablename__ == "notifications"
