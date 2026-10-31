from datetime import datetime, timedelta, timezone

from app.models.models import MaintenanceTasks
from app.services import maintenance

from .conftest import auth


def create_task(scenario, **overrides):
    payload = {
        "contract_id": scenario["contracts"]["Cliente A"],
        "name": "Backup semanal",
        "recurrence": "semanal",
        "checklist": ["Copiar base", "Verificar restauración"],
        "estimated_hours": 2,
    }
    payload.update(overrides)
    return scenario["api"].post(
        "/api/maintenance-tasks", json=payload, headers=auth(scenario["tokens"]["admin"])
    )


def test_create_and_list_tasks(scenario):
    response = create_task(scenario)
    assert response.status_code == 201, response.text
    task = response.json()
    assert task["name"] == "Backup semanal"
    assert task["recurrence"] == "semanal"
    assert task["checklist"] == ["Copiar base", "Verificar restauración"]

    listing = scenario["api"].get(
        "/api/maintenance-tasks", headers=auth(scenario["tokens"]["tecnico"])
    )
    assert listing.status_code == 200
    assert len(listing.json()) == 1


def test_client_maintenance_isolation(scenario):
    create_task(scenario)
    listing = scenario["api"].get(
        "/api/maintenance-tasks", headers=auth(scenario["tokens"]["cliente_b"])
    )
    assert listing.status_code == 200
    assert listing.json() == []


def test_run_consumes_hour_bank(scenario):
    task = create_task(scenario).json()
    response = scenario["api"].post(
        f"/api/maintenance-tasks/{task['id']}/runs",
        json={"hours": 2.5, "notes": "Ejecutado sin novedades"},
        headers=auth(scenario["tokens"]["tecnico"]),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["last_run_at"] is not None
    assert body["last_run_by"] == "Técnico"
    assert body["runs"][0]["hours"] == 2.5

    bank = scenario["api"].get(
        f"/api/contracts/{scenario['contracts']['Cliente A']}/hour-bank",
        headers=auth(scenario["tokens"]["admin"]),
    ).json()
    assert bank["hours_consumed"] == 2.5


def test_run_rejected_on_archived_contract(scenario):
    task = create_task(scenario).json()
    scenario["api"].put(
        f"/api/contracts/{scenario['contracts']['Cliente A']}",
        json={
            "plan_id": scenario["plan_id"],
            "hours_bank_month": 60,
            "cut_date_day": 1,
            "hourly_rate_extra": 50,
            "timezone": "UTC",
            "state": "archivado",
        },
        headers=auth(scenario["tokens"]["admin"]),
    )
    response = scenario["api"].post(
        f"/api/maintenance-tasks/{task['id']}/runs",
        json={"hours": 1},
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert response.status_code == 409


def test_task_becomes_due_after_recurrence(scenario, db):
    task = create_task(scenario).json()
    row = db.get(MaintenanceTasks, task["id"])
    row.last_run_at = datetime.now(timezone.utc) - timedelta(days=8)
    db.commit()

    detail = scenario["api"].get(
        f"/api/maintenance-tasks/{task['id']}", headers=auth(scenario["tokens"]["admin"])
    ).json()
    assert detail["due"] is True

    due_only = scenario["api"].get(
        "/api/maintenance-tasks?due=true", headers=auth(scenario["tokens"]["admin"])
    ).json()
    assert [item["id"] for item in due_only] == [task["id"]]


def test_contract_calendar_month_hours(scenario):
    task = create_task(scenario).json()
    scenario["api"].post(
        f"/api/maintenance-tasks/{task['id']}/runs",
        json={"hours": 1.5},
        headers=auth(scenario["tokens"]["admin"]),
    )
    now = datetime.now(timezone.utc)
    calendar = scenario["api"].get(
        f"/api/maintenance-tasks/contracts/{scenario['contracts']['Cliente A']}/calendar"
        f"?year={now.year}&month={now.month}",
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert calendar.status_code == 200, calendar.text
    body = calendar.json()
    assert body["month_hours"] == 1.5
    assert body["runs"][0]["task_name"] == "Backup semanal"


def test_overdue_detection_helper(scenario, db):
    row = MaintenanceTasks(
        contract_id=scenario["contracts"]["Cliente A"],
        name="Tarea vieja",
        recurrence="mensual",
        checklist=[],
        active=True,
        created_at=datetime.now(timezone.utc) - timedelta(days=45),
    )
    db.add(row)
    db.commit()
    overdue = maintenance.overdue_tasks(db)
    assert row.id in [task.id for task in overdue]
