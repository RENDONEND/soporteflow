from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.models.models import Contracts, Plans, Tickets
from app.services.sla_monitor import check_sla
from app.services.tickets import deadlines_for

from .conftest import auth


def create_ticket(scenario, token="admin", contract="Cliente A", **overrides):
    payload = {
        "contract_id": scenario["contracts"][contract],
        "type": "soporte",
        "severity": "critico",
        "title": "No puedo entrar al sistema",
        "description": "El login devuelve error 500",
    }
    payload.update(overrides)
    return scenario["api"].post(
        "/api/tickets", json=payload, headers=auth(scenario["tokens"][token])
    )


def test_create_soporte_ticket_sets_sla(scenario):
    response = create_ticket(scenario)
    assert response.status_code == 201, response.text
    ticket = response.json()
    assert ticket["status"] == "abierto"
    assert ticket["client_name"] == "Cliente A"
    assert ticket["response_deadline"] is not None
    assert ticket["resolution_deadline"] is not None
    assert ticket["resolution_state"] == "ok"
    assert ticket["response_state"] == "ok"
    assert ticket["is_overdue"] is False
    assert datetime.fromisoformat(
        ticket["response_deadline"]
    ) < datetime.fromisoformat(ticket["resolution_deadline"])


def test_soporte_requires_severity_and_funcionalidad_rejects_it(scenario):
    missing = create_ticket(scenario, severity=None)
    assert missing.status_code == 422

    invalid = create_ticket(scenario, type="funcionalidad", severity="alto")
    assert invalid.status_code == 422


def test_funcionalidad_ticket_has_no_sla(scenario):
    response = create_ticket(
        scenario,
        token="cliente_a",
        type="funcionalidad",
        severity=None,
        title="Quiero un módulo de reportes",
    )
    assert response.status_code == 201, response.text
    ticket = response.json()
    assert ticket["response_deadline"] is None
    assert ticket["resolution_deadline"] is None
    assert ticket["response_state"] == "none"
    assert ticket["resolution_state"] == "none"


def test_client_isolation_on_tickets(scenario):
    own = create_ticket(scenario, token="cliente_a")
    assert own.status_code == 201
    other = create_ticket(scenario, contract="Cliente B")
    assert other.status_code == 201

    forbidden = create_ticket(scenario, token="cliente_a", contract="Cliente B")
    assert forbidden.status_code == 403

    listing = scenario["api"].get("/api/tickets", headers=auth(scenario["tokens"]["cliente_a"]))
    assert listing.status_code == 200
    tickets = listing.json()
    assert len(tickets) == 1
    assert tickets[0]["id"] == own.json()["id"]

    detail = scenario["api"].get(
        f"/api/tickets/{other.json()['id']}", headers=auth(scenario["tokens"]["cliente_a"])
    )
    assert detail.status_code == 403


def test_comments_and_visibility(scenario):
    ticket_id = create_ticket(scenario, token="cliente_a").json()["id"]
    headers_client = auth(scenario["tokens"]["cliente_a"])
    headers_tech = auth(scenario["tokens"]["tecnico"])

    public = scenario["api"].post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "Estamos revisando"},
        headers=headers_tech,
    )
    assert public.status_code == 200, public.text
    assert public.json()["first_response_at"] is not None
    assert public.json()["response_state"] == "met"

    internal = scenario["api"].post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "Revisar logs del servidor", "internal": True},
        headers=headers_tech,
    )
    assert internal.status_code == 200

    forbidden = scenario["api"].post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "nota interna", "internal": True},
        headers=headers_client,
    )
    assert forbidden.status_code == 403

    as_client = scenario["api"].get(f"/api/tickets/{ticket_id}", headers=headers_client)
    assert as_client.status_code == 200
    assert [c["body"] for c in as_client.json()["comments"]] == ["Estamos revisando"]

    as_tech = scenario["api"].get(f"/api/tickets/{ticket_id}", headers=headers_tech)
    assert len(as_tech.json()["comments"]) == 2


def test_client_comment_does_not_count_as_first_response(scenario):
    ticket_id = create_ticket(scenario, token="cliente_a").json()["id"]
    response = scenario["api"].post(
        f"/api/tickets/{ticket_id}/comments",
        json={"body": "Alguna novedad?"},
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert response.status_code == 200
    assert response.json()["first_response_at"] is None


def test_time_log_consumes_hour_bank(scenario):
    ticket_id = create_ticket(scenario).json()["id"]
    contract_id = scenario["contracts"]["Cliente A"]

    response = scenario["api"].post(
        f"/api/tickets/{ticket_id}/time-logs",
        json={"hours": 5, "note": "Diagnóstico y fix"},
        headers=auth(scenario["tokens"]["tecnico"]),
    )
    assert response.status_code == 200, response.text
    ticket = response.json()
    assert ticket["hours_logged"] == 5
    assert ticket["status"] == "en_progreso"
    assert ticket["first_response_at"] is not None

    bank = scenario["api"].get(
        f"/api/contracts/{contract_id}/hour-bank",
        headers=auth(scenario["tokens"]["tecnico"]),
    )
    assert bank.status_code == 200
    data = bank.json()
    assert data["hours_assigned"] == 60
    assert data["hours_consumed"] == 5
    assert data["hours_remaining"] == 55

    forbidden = scenario["api"].post(
        f"/api/tickets/{ticket_id}/time-logs",
        json={"hours": 1},
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert forbidden.status_code == 403


def test_funcionalidad_time_log_does_not_consume_bank(scenario):
    contract_id = scenario["contracts"]["Cliente A"]
    ticket_id = create_ticket(
        scenario, type="funcionalidad", severity=None, title="Nueva pantalla"
    ).json()["id"]

    response = scenario["api"].post(
        f"/api/tickets/{ticket_id}/time-logs",
        json={"hours": 2, "note": "Estimación"},
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert response.status_code == 200
    assert response.json()["hours_logged"] == 2

    bank = scenario["api"].get(
        f"/api/contracts/{contract_id}/hour-bank",
        headers=auth(scenario["tokens"]["admin"]),
    ).json()
    assert bank["hours_consumed"] == 0
    assert bank["hours_remaining"] == 60


def test_status_transitions_and_client_cannot_patch(scenario):
    ticket_id = create_ticket(scenario).json()["id"]
    headers_tech = auth(scenario["tokens"]["tecnico"])

    resolved = scenario["api"].patch(
        f"/api/tickets/{ticket_id}", json={"status": "resuelto"}, headers=headers_tech
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["resolved_at"] is not None
    assert resolved.json()["resolution_state"] == "met"
    assert resolved.json()["first_response_at"] is not None

    reopened = scenario["api"].patch(
        f"/api/tickets/{ticket_id}", json={"status": "abierto"}, headers=headers_tech
    )
    assert reopened.status_code == 200
    assert reopened.json()["resolved_at"] is None

    forbidden = scenario["api"].patch(
        f"/api/tickets/{ticket_id}",
        json={"status": "cerrado"},
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert forbidden.status_code == 403


def test_severity_change_recomputes_deadline(scenario):
    ticket = create_ticket(scenario, severity="bajo").json()
    before = datetime.fromisoformat(ticket["resolution_deadline"])

    response = scenario["api"].patch(
        f"/api/tickets/{ticket['id']}",
        json={"severity": "critico"},
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert response.status_code == 200
    after = datetime.fromisoformat(response.json()["resolution_deadline"])
    assert after < before


def test_attachments_upload_download_and_isolation(scenario, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    ticket_id = create_ticket(scenario).json()["id"]
    headers_admin = auth(scenario["tokens"]["admin"])

    uploaded = scenario["api"].post(
        f"/api/tickets/{ticket_id}/attachments",
        files={"file": ("captura.txt", b"contenido de prueba", "text/plain")},
        headers=headers_admin,
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment = uploaded.json()
    assert attachment["filename"] == "captura.txt"
    assert attachment["size"] == len(b"contenido de prueba")

    downloaded = scenario["api"].get(
        f"/api/tickets/{ticket_id}/attachments/{attachment['id']}",
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"contenido de prueba"

    forbidden = scenario["api"].get(
        f"/api/tickets/{ticket_id}/attachments/{attachment['id']}",
        headers=auth(scenario["tokens"]["cliente_b"]),
    )
    assert forbidden.status_code == 403

    detail = scenario["api"].get(
        f"/api/tickets/{ticket_id}", headers=auth(scenario["tokens"]["admin"])
    )
    assert detail.json()["attachments"][0]["id"] == attachment["id"]


def test_time_log_rejected_on_archived_contract(scenario):
    headers = auth(scenario["tokens"]["admin"])
    contract_id = scenario["contracts"]["Cliente A"]
    ticket_id = create_ticket(scenario).json()["id"]

    contract = scenario["db"].get(Contracts, contract_id)
    contract.state = "archivado"
    scenario["db"].commit()

    response = scenario["api"].post(
        f"/api/tickets/{ticket_id}/time-logs",
        json={"hours": 2},
        headers=headers,
    )
    assert response.status_code == 409, response.text

    bank = scenario["api"].get(
        f"/api/contracts/{contract_id}/hour-bank", headers=headers
    ).json()
    assert bank["hours_consumed"] == 0


def test_attachment_delete_is_admin_only(scenario, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    ticket_id = create_ticket(scenario).json()["id"]
    uploaded = scenario["api"].post(
        f"/api/tickets/{ticket_id}/attachments",
        files={"file": ("nota.txt", b"contenido", "text/plain")},
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["id"]

    forbidden = scenario["api"].delete(
        f"/api/tickets/{ticket_id}/attachments/{attachment_id}",
        headers=auth(scenario["tokens"]["tecnico"]),
    )
    assert forbidden.status_code == 403

    removed = scenario["api"].delete(
        f"/api/tickets/{ticket_id}/attachments/{attachment_id}",
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert removed.status_code == 204

    missing = scenario["api"].get(
        f"/api/tickets/{ticket_id}/attachments/{attachment_id}",
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert missing.status_code == 404


def test_dashboard_agency_and_client(scenario):
    create_ticket(scenario, token="cliente_a")
    create_ticket(scenario, contract="Cliente B")

    agency = scenario["api"].get(
        "/api/dashboard", headers=auth(scenario["tokens"]["admin"])
    )
    assert agency.status_code == 200
    data = agency.json()
    assert data["role"] == "admin"
    assert data["counts"]["clients"] == 2
    assert data["counts"]["active_contracts"] == 2
    assert data["counts"]["open_tickets"] == 2
    assert data["hours"]["assigned"] == 120
    assert len(data["contracts"]) == 2
    assert len(data["recent_tickets"]) == 2

    client = scenario["api"].get(
        "/api/dashboard", headers=auth(scenario["tokens"]["cliente_a"])
    )
    assert client.status_code == 200
    own = client.json()
    assert own["role"] == "cliente"
    assert own["counts"]["clients"] == 1
    assert own["counts"]["active_contracts"] == 1
    assert own["counts"]["open_tickets"] == 1
    assert own["hours"]["assigned"] == 60
    assert len(own["contracts"]) == 1
    assert own["contracts"][0]["client_name"] == "Cliente A"


def test_sla_monitor_detects_breaches(scenario):
    ticket_id = create_ticket(scenario).json()["id"]
    ticket = scenario["db"].get(Tickets, ticket_id)
    now = datetime.now(timezone.utc)
    ticket.sla_deadline = now - timedelta(hours=1)
    ticket.response_deadline = now - timedelta(hours=2)
    scenario["db"].commit()

    result = check_sla(scenario["db"], now)
    assert result["open_with_sla"] == 1
    assert result["breached"] == [ticket_id]
    assert result["response_overdue"] == [ticket_id]


def test_deadlines_helper_uses_coverage_window(scenario):
    plan = Plans(
        name="Plan unitario",
        window_coverage={
            "timezone": "UTC",
            "days": [0, 1, 2, 3, 4],
            "start_hour": 9,
            "end_hour": 18,
            "holidays": [],
        },
        sla_by_severity={"normal": 27},
        response_sla_by_severity={"normal": 12},
        hours_bank_default=60,
    )
    opened = datetime(2026, 10, 19, 17, 0, tzinfo=timezone.utc)  # lunes 17:00
    response_deadline, resolution_deadline = deadlines_for(
        plan, "normal", opened
    )

    assert response_deadline == datetime(2026, 10, 21, 11, 0, tzinfo=timezone.utc)
    assert resolution_deadline == datetime(2026, 10, 22, 17, 0, tzinfo=timezone.utc)
