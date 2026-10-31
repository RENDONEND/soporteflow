from app.services import notifications

from .conftest import auth


def test_ticket_creation_notifies_agency(scenario):
    response = scenario["api"].post(
        "/api/tickets",
        json={
            "contract_id": scenario["contracts"]["Cliente A"],
            "type": "soporte",
            "severity": "critico",
            "title": "El sistema no responde",
        },
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert response.status_code == 201

    agency = scenario["api"].get(
        "/api/notifications", headers=auth(scenario["tokens"]["admin"])
    ).json()
    assert agency["unread"] >= 1
    assert any(item["type"] == "ticket_creado" for item in agency["items"])

    # el cliente que abrió el ticket no recibe su propio aviso
    client = scenario["api"].get(
        "/api/notifications", headers=auth(scenario["tokens"]["cliente_a"])
    ).json()
    assert client["items"] == []


def test_comment_notifies_client(scenario):
    ticket = scenario["api"].post(
        "/api/tickets",
        json={
            "contract_id": scenario["contracts"]["Cliente A"],
            "type": "soporte",
            "severity": "normal",
            "title": "Consulta",
        },
        headers=auth(scenario["tokens"]["cliente_a"]),
    ).json()

    scenario["api"].post(
        f"/api/tickets/{ticket['id']}/comments",
        json={"body": "Estamos revisándolo"},
        headers=auth(scenario["tokens"]["tecnico"]),
    )
    client = scenario["api"].get(
        "/api/notifications", headers=auth(scenario["tokens"]["cliente_a"])
    ).json()
    assert any(item["type"] == "ticket_comentario" for item in client["items"])

    # las notas internas no generan aviso
    scenario["api"].post(
        f"/api/tickets/{ticket['id']}/comments",
        json={"body": "Nota privada", "internal": True},
        headers=auth(scenario["tokens"]["tecnico"]),
    )
    after = scenario["api"].get(
        "/api/notifications", headers=auth(scenario["tokens"]["cliente_a"])
    ).json()
    assert sum(1 for item in after["items"] if item["type"] == "ticket_comentario") == 1


def test_mark_read_and_read_all(scenario):
    scenario["api"].post(
        "/api/tickets",
        json={
            "contract_id": scenario["contracts"]["Cliente A"],
            "type": "soporte",
            "severity": "normal",
            "title": "Algo",
        },
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    listing = scenario["api"].get(
        "/api/notifications", headers=auth(scenario["tokens"]["admin"])
    ).json()
    first = listing["items"][0]
    read = scenario["api"].post(
        f"/api/notifications/{first['id']}/read",
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert read.status_code == 200
    assert read.json()["read"] is True

    scenario["api"].post(
        "/api/notifications/read-all", headers=auth(scenario["tokens"]["admin"])
    )
    after = scenario["api"].get(
        "/api/notifications", headers=auth(scenario["tokens"]["admin"])
    ).json()
    assert after["unread"] == 0


def test_client_cannot_read_other_users_notification(scenario, db):
    notification = notifications.Notifications(
        user_id=2, type=notifications.NotificationType.TICKET_CREADO, title="x"
    )
    db.add(notification)
    db.commit()
    response = scenario["api"].post(
        f"/api/notifications/{notification.id}/read",
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert response.status_code == 404


def test_email_disabled_by_default():
    assert notifications.settings.email_enabled is False
    assert notifications.send_email("a@b.com", "asunto", "cuerpo") is False
