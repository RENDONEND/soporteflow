def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_sin_token_da_401(scenario):
    api = scenario["api"]
    assert api.get("/clients").status_code == 401
    assert api.get("/contracts").status_code == 401


def test_login_incorrecto(scenario):
    api = scenario["api"]
    response = api.post(
        "/auth/login", json={"email": "admin@test.local", "password": "mala"}
    )
    assert response.status_code == 401


def test_login_y_me(scenario):
    api = scenario["api"]
    response = api.get("/auth/me", headers=auth(scenario["tokens"]["admin"]))
    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    assert response.json()["email"] == "admin@test.local"


def test_cliente_no_puede_crear_clientes(scenario):
    api = scenario["api"]
    response = api.post(
        "/clients",
        json={"name": "Nuevo"},
        headers=auth(scenario["tokens"]["cliente_a"]),
    )
    assert response.status_code == 403


def test_cliente_solo_ve_su_cliente(scenario):
    api = scenario["api"]
    response = api.get("/clients", headers=auth(scenario["tokens"]["cliente_a"]))
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [scenario["clients"]["Cliente A"]]


def test_aislamiento_entre_clientes(scenario):
    api = scenario["api"]
    token_a = scenario["tokens"]["cliente_a"]
    client_b = scenario["clients"]["Cliente B"]
    contract_b = scenario["contracts"]["Cliente B"]

    assert api.get(f"/clients/{client_b}", headers=auth(token_a)).status_code == 403
    assert (
        api.get(f"/clients/{client_b}/applications", headers=auth(token_a)).status_code
        == 403
    )
    assert (
        api.get(f"/contracts/{contract_b}", headers=auth(token_a)).status_code == 403
    )
    assert (
        api.get(f"/contracts/{contract_b}/hour-bank", headers=auth(token_a)).status_code
        == 403
    )

    own_contracts = api.get("/contracts", headers=auth(token_a)).json()
    assert [item["id"] for item in own_contracts] == [scenario["contracts"]["Cliente A"]]


def test_cliente_ve_su_banco_pero_no_consume(scenario):
    api = scenario["api"]
    token = scenario["tokens"]["cliente_a"]
    contract_a = scenario["contracts"]["Cliente A"]

    bank = api.get(f"/contracts/{contract_a}/hour-bank", headers=auth(token))
    assert bank.status_code == 200
    assert bank.json()["hours_remaining"] == 60

    response = api.post(
        f"/contracts/{contract_a}/hour-bank/consume",
        json={"hours": 1},
        headers=auth(token),
    )
    assert response.status_code == 403


def test_admin_crea_cliente_app_contrato_y_consume(scenario):
    api = scenario["api"]
    headers = auth(scenario["tokens"]["admin"])

    client = api.post("/clients", json={"name": "Cliente Nuevo"}, headers=headers)
    assert client.status_code == 201
    client_id = client.json()["id"]

    application = api.post(
        f"/clients/{client_id}/applications",
        json={"name": "App Nueva", "description": "Portal"},
        headers=headers,
    )
    assert application.status_code == 201
    application_id = application.json()["id"]

    contract = api.post(
        f"/applications/{application_id}/contracts",
        json={
            "plan_id": scenario["plan_id"],
            "hours_bank_month": 60,
            "cut_date_day": 1,
            "currency": "usd",
            "hourly_rate_extra": 45,
            "timezone": "UTC",
        },
        headers=headers,
    )
    assert contract.status_code == 201, contract.text
    contract_id = contract.json()["id"]
    assert contract.json()["currency"] == "USD"

    duplicate = api.post(
        f"/applications/{application_id}/contracts",
        json={
            "plan_id": scenario["plan_id"],
            "hours_bank_month": 20,
            "cut_date_day": 1,
            "currency": "USD",
            "hourly_rate_extra": 45,
            "timezone": "UTC",
        },
        headers=headers,
    )
    assert duplicate.status_code == 409

    bank = api.get(f"/contracts/{contract_id}/hour-bank", headers=headers)
    assert bank.status_code == 200
    assert bank.json()["hours_remaining"] == 60

    consumed = api.post(
        f"/contracts/{contract_id}/hour-bank/consume",
        json={"hours": 5, "note": "ajuste manual"},
        headers=headers,
    )
    assert consumed.status_code == 200
    assert consumed.json()["hours_remaining"] == 55
    assert consumed.json()["alert"] == "ok"

    history = api.get(f"/contracts/{contract_id}/hour-bank/history", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) == 1

    technician = api.post(
        f"/contracts/{contract_id}/hour-bank/consume",
        json={"hours": 1},
        headers=auth(scenario["tokens"]["tecnico"]),
    )
    assert technician.status_code == 200
    assert technician.json()["hours_remaining"] == 54


def test_contrato_con_plan_inexistente(scenario):
    api = scenario["api"]
    response = api.post(
        f"/applications/1/contracts",
        json={
            "plan_id": 9999,
            "hours_bank_month": 10,
            "cut_date_day": 1,
            "currency": "USD",
            "hourly_rate_extra": 0,
            "timezone": "UTC",
        },
        headers=auth(scenario["tokens"]["admin"]),
    )
    assert response.status_code == 404


def test_crud_de_planes(scenario):
    api = scenario["api"]
    headers = auth(scenario["tokens"]["admin"])
    payload = {
        "name": "Plan Custom",
        "window_coverage": {
            "timezone": "UTC",
            "days": [0, 1, 2],
            "start_hour": 8,
            "end_hour": 16,
            "holidays": [],
        },
        "sla_by_severity": {"critico": 4, "normal": 8},
        "hours_bank_default": 10,
        "what_covers": ["Incidentes"],
    }
    created = api.post("/plans", json=payload, headers=headers)
    assert created.status_code == 201, created.text
    plan_id = created.json()["id"]

    updated = api.put(
        f"/plans/{plan_id}",
        json={**payload, "name": "Plan Custom v2"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Plan Custom v2"

    duplicated = api.post(f"/plans/{plan_id}/duplicate", headers=headers)
    assert duplicated.status_code == 201
    assert duplicated.json()["name"] == "Plan Custom v2 (copia)"


def test_plan_invalido_da_422(scenario):
    api = scenario["api"]
    headers = auth(scenario["tokens"]["admin"])
    payload = {
        "name": "Malo",
        "window_coverage": {"timezone": "UTC", "start_hour": 18, "end_hour": 9},
        "sla_by_severity": {"critico": 4},
        "hours_bank_default": 10,
    }
    assert api.post("/plans", json=payload, headers=headers).status_code == 422

    payload["window_coverage"] = {"timezone": "UTC", "start_hour": 9, "end_hour": 18}
    payload["sla_by_severity"] = {"urgente": 1}
    assert api.post("/plans", json=payload, headers=headers).status_code == 422

    payload["sla_by_severity"] = {"critico": -1}
    assert api.post("/plans", json=payload, headers=headers).status_code == 422


def test_tecnico_no_puede_crear_clientes(scenario):
    api = scenario["api"]
    response = api.post(
        "/clients", json={"name": "X"}, headers=auth(scenario["tokens"]["tecnico"])
    )
    assert response.status_code == 403
