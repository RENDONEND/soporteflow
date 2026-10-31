from app.models.models import TicketStatus

from .conftest import auth


def create_functionality(scenario, **overrides):
    payload = {
        "contract_id": scenario["contracts"]["Cliente A"],
        "type": "funcionalidad",
        "title": "Agregar reportes",
        "description": "Queremos reportes mensuales",
    }
    payload.update(overrides)
    response = scenario["api"].post(
        "/api/tickets", json=payload, headers=auth(scenario["tokens"]["admin"])
    )
    assert response.status_code == 201, response.text
    return response.json()


def change_status(scenario, ticket_id, status, token="admin"):
    return scenario["api"].patch(
        f"/api/tickets/{ticket_id}",
        json={"status": status},
        headers=auth(scenario["tokens"][token]),
    )


def test_functionality_ticket_cannot_close_without_pack(scenario):
    ticket = create_functionality(scenario)
    assert ticket["closable"] is False
    response = change_status(scenario, ticket["id"], "resuelto")
    assert response.status_code == 409
    assert "RF-37" in response.json()["detail"]


def test_functionality_ticket_stays_open_if_pack_not_approved(scenario):
    ticket = create_functionality(scenario)
    scenario["api"].post(
        "/api/feature-packs",
        json={
            "contract_id": scenario["contracts"]["Cliente A"],
            "name": "Pack reportes",
            "hours_estimated": 10,
            "price": 800,
            "ticket_ids": [ticket["id"]],
        },
        headers=auth(scenario["tokens"]["admin"]),
    )
    blocked = change_status(scenario, ticket["id"], "cerrado")
    assert blocked.status_code == 409

    # una vez aprobado por el cliente, ya se puede cerrar
    packs = scenario["api"].get(
        "/api/feature-packs", headers=auth(scenario["tokens"]["admin"])
    ).json()
    pack_id = packs[0]["id"]
    scenario["api"].post(
        f"/api/feature-packs/{pack_id}/decision",
        json={"approve": True},
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    detail = scenario["api"].get(
        f"/api/tickets/{ticket['id']}", headers=auth(scenario["tokens"]["admin"])
    ).json()
    assert detail["closable"] is True
    allowed = change_status(scenario, ticket["id"], "cerrado")
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["status"] == TicketStatus.CERRADO.value


def test_support_ticket_closes_without_pack(scenario):
    support = scenario["api"].post(
        "/api/tickets",
        json={
            "contract_id": scenario["contracts"]["Cliente A"],
            "type": "soporte",
            "severity": "normal",
            "title": "Falla el login",
        },
        headers=auth(scenario["tokens"]["cliente_a"]),
    ).json()
    assert support["closable"] is True
    response = change_status(scenario, support["id"], "resuelto")
    assert response.status_code == 200
