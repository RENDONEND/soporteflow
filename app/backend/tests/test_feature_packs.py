from app.models.models import PackStatus

from .conftest import auth


def create_ticket(scenario, token="cliente_a", contract="Cliente A", **overrides):
    payload = {
        "contract_id": scenario["contracts"][contract],
        "type": "funcionalidad",
        "title": "Agregar exportación a Excel",
        "description": "Queremos exportar el listado de facturas",
    }
    payload.update(overrides)
    response = scenario["api"].post(
        "/api/tickets", json=payload, headers=auth(scenario["tokens"][token])
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_pack(scenario, ticket_ids, **overrides):
    payload = {
        "contract_id": scenario["contracts"]["Cliente A"],
        "name": "Pack exportaciones",
        "description": "Exportación a Excel y PDF",
        "hours_estimated": 16,
        "price": 1200,
        "currency": "USD",
        "ticket_ids": ticket_ids,
    }
    payload.update(overrides)
    return scenario["api"].post(
        "/api/feature-packs", json=payload, headers=auth(scenario["tokens"]["admin"])
    )


def test_create_pack_from_functionality_tickets(scenario):
    first = create_ticket(scenario)
    second = create_ticket(scenario, title="Exportar a PDF")
    response = create_pack(scenario, [first["id"], second["id"]])
    assert response.status_code == 201, response.text
    pack = response.json()
    assert pack["status"] == PackStatus.PROPUESTO.value
    assert pack["hours_estimated"] == 16
    assert pack["price"] == 1200
    assert sorted(pack["ticket_ids"]) == sorted([first["id"], second["id"]])
    assert pack["client_name"] == "Cliente A"
    assert pack["currency"] == "USD"


def test_pack_rejects_support_ticket(scenario):
    support = scenario["api"].post(
        "/api/tickets",
        json={
            "contract_id": scenario["contracts"]["Cliente A"],
            "type": "soporte",
            "severity": "normal",
            "title": "El login falla",
        },
        headers=auth(scenario["tokens"]["cliente_a"]),
    ).json()
    response = create_pack(scenario, [support["id"]])
    assert response.status_code == 400


def test_pack_rejects_ticket_from_other_contract(scenario):
    other = scenario["api"].post(
        "/api/tickets",
        json={
            "contract_id": scenario["contracts"]["Cliente B"],
            "type": "funcionalidad",
            "title": "Algo de B",
        },
        headers=auth(scenario["tokens"]["admin"]),
    ).json()
    response = create_pack(scenario, [other["id"]])
    assert response.status_code == 400


def test_ticket_cannot_belong_to_two_packs(scenario):
    ticket = create_ticket(scenario)
    assert create_pack(scenario, [ticket["id"]]).status_code == 201
    again = create_pack(scenario, [ticket["id"]], name="Otro pack")
    assert again.status_code == 409


def test_client_approves_pack(scenario):
    ticket = create_ticket(scenario)
    pack = create_pack(scenario, [ticket["id"]]).json()
    response = scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/decision",
        json={"approve": True},
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert response.status_code == 200, response.text
    decided = response.json()
    assert decided["status"] == PackStatus.APROBADO.value
    assert decided["approved_at"] is not None
    assert decided["decided_by_name"] == "Cliente A"


def test_client_rejects_pack_requires_reason(scenario):
    ticket = create_ticket(scenario)
    pack = create_pack(scenario, [ticket["id"]]).json()
    missing = scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/decision",
        json={"approve": False},
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert missing.status_code == 400

    rejected = scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/decision",
        json={"approve": False, "reason": "Muy caro por ahora"},
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == PackStatus.RECHAZADO.value
    assert rejected.json()["rejection_reason"] == "Muy caro por ahora"


def test_pack_cannot_be_decided_twice(scenario):
    ticket = create_ticket(scenario)
    pack = create_pack(scenario, [ticket["id"]]).json()
    headers = auth(scenario["tokens"]["cliente_a"])
    assert (
        scenario["api"]
        .post(f"/api/feature-packs/{pack['id']}/decision", json={"approve": True}, headers=headers)
        .status_code
        == 200
    )
    again = scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/decision", json={"approve": True}, headers=headers
    )
    assert again.status_code == 409


def test_pack_client_isolation(scenario):
    ticket = create_ticket(scenario)
    pack = create_pack(scenario, [ticket["id"]]).json()
    listing = scenario["api"].get(
        "/api/feature-packs", headers=auth(scenario["tokens"]["cliente_b"])
    )
    assert listing.status_code == 200
    assert listing.json() == []
    detail = scenario["api"].get(
        f"/api/feature-packs/{pack['id']}", headers=auth(scenario["tokens"]["cliente_b"])
    )
    assert detail.status_code == 403


def test_pack_status_flow_and_real_hours(scenario):
    ticket = create_ticket(scenario)
    pack = create_pack(scenario, [ticket["id"]]).json()
    headers = auth(scenario["tokens"]["cliente_a"])
    scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/decision", json={"approve": True}, headers=headers
    )

    agency = auth(scenario["tokens"]["tecnico"])
    scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/status",
        json={"status": "en_desarrollo"},
        headers=agency,
    )
    # horas reales salen de los time logs de los tickets del pack
    scenario["api"].post(
        f"/api/tickets/{ticket['id']}/time-logs",
        json={"hours": 5, "note": "Implementación"},
        headers=agency,
    )
    delivered = scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/status",
        json={"status": "entregado"},
        headers=agency,
    )
    assert delivered.status_code == 200, delivered.text
    assert delivered.json()["hours_real"] == 5
    assert delivered.json()["delivered_at"] is not None

    billed = scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/status",
        json={"status": "facturado"},
        headers=agency,
    )
    assert billed.status_code == 200
    assert billed.json()["billed_at"] is not None


def test_pack_development_requires_approval(scenario):
    ticket = create_ticket(scenario)
    pack = create_pack(scenario, [ticket["id"]]).json()
    response = scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/status",
        json={"status": "en_desarrollo"},
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert response.status_code == 409


def test_pack_hours_do_not_touch_bank(scenario):
    ticket = create_ticket(scenario)
    pack = create_pack(scenario, [ticket["id"]]).json()
    headers = auth(scenario["tokens"]["cliente_a"])
    scenario["api"].post(
        f"/api/feature-packs/{pack['id']}/decision", json={"approve": True}, headers=headers
    )
    scenario["api"].post(
        f"/api/tickets/{ticket['id']}/time-logs",
        json={"hours": 4},
        headers=auth(scenario["tokens"]["tecnico"]),
    )
    bank = scenario["api"].get(
        f"/api/contracts/{scenario['contracts']['Cliente A']}/hour-bank",
        headers=auth(scenario["tokens"]["admin"]),
    ).json()
    assert bank["hours_consumed"] == 0


def test_pack_candidates_exclude_assigned_tickets(scenario):
    ticket = create_ticket(scenario)
    create_pack(scenario, [ticket["id"]])
    other = create_ticket(scenario, title="Otra mejora")
    response = scenario["api"].get(
        f"/api/feature-packs/contracts/{scenario['contracts']['Cliente A']}/candidates",
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert other["id"] in ids
    assert ticket["id"] not in ids
