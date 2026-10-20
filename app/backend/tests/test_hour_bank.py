from datetime import date

import pytest

from app.models.models import Applications, Clients, Contracts
from app.services import hour_bank


@pytest.fixture()
def contract(db, plan):
    client = Clients(name="ACME")
    db.add(client)
    db.flush()
    application = Applications(client_id=client.id, name="Portal")
    db.add(application)
    db.flush()
    contract = Contracts(
        application_id=application.id,
        plan_id=plan.id,
        hours_bank_month=60,
        cut_date_day=1,
        timezone="UTC",
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


def test_ciclo_mes_calendario(contract):
    start = hour_bank.cycle_start(contract, date(2026, 10, 20))
    assert start == date(2026, 10, 1)
    assert hour_bank.cycle_end(contract, start) == date(2026, 11, 1)


def test_ciclo_con_dia_de_corte_15(contract):
    contract.cut_date_day = 15
    assert hour_bank.cycle_start(contract, date(2026, 10, 10)) == date(2026, 9, 15)
    assert hour_bank.cycle_start(contract, date(2026, 10, 15)) == date(2026, 10, 15)
    assert hour_bank.cycle_end(contract, date(2026, 10, 15)) == date(2026, 11, 15)


def test_dia_de_corte_31_se_ajusta_a_meses_cortos(contract):
    contract.cut_date_day = 31
    assert hour_bank.cycle_start(contract, date(2026, 2, 10)) == date(2026, 1, 31)
    assert hour_bank.cycle_start(contract, date(2026, 2, 28)) == date(2026, 2, 28)
    assert hour_bank.cycle_end(contract, date(2026, 2, 28)) == date(2026, 3, 31)


def test_banco_inicial(contract, db):
    bank = hour_bank.get_bank(db, contract, date(2026, 10, 20))
    assert bank["hours_assigned"] == 60
    assert bank["hours_consumed"] == 0
    assert bank["hours_remaining"] == 60
    assert bank["percent_used"] == 0
    assert bank["alert"] == "ok"
    assert bank["period_start"] == date(2026, 10, 1)
    assert bank["period_end"] == date(2026, 11, 1)
    assert bank["closed"] is False


def test_consumo_y_alerta_de_umbral(contract, db):
    bank = hour_bank.consume(db, contract, 50, note="ajuste", user_id=None, ref=date(2026, 10, 20))
    assert bank["hours_consumed"] == 50
    assert bank["hours_remaining"] == 10
    assert bank["percent_used"] == pytest.approx(83.3)
    assert bank["alert"] == "umbral"


def test_consumo_agota_el_banco(contract, db):
    bank = hour_bank.consume(db, contract, 70, ref=date(2026, 10, 20))
    assert bank["hours_remaining"] == -10
    assert bank["alert"] == "agotado"
    assert bank["percent_used"] > 100


def test_consumo_invalido(contract, db):
    with pytest.raises(hour_bank.HourBankError):
        hour_bank.consume(db, contract, 0, ref=date(2026, 10, 20))
    with pytest.raises(hour_bank.HourBankError):
        hour_bank.consume(db, contract, -5, ref=date(2026, 10, 20))


def test_cierre_sin_arrastre(contract, db):
    hour_bank.consume(db, contract, 55, ref=date(2026, 9, 10))
    db.commit()

    result = hour_bank.run_maintenance(db, today=date(2026, 10, 5))
    db.commit()
    assert result["closed"] == 1

    bank = hour_bank.get_bank(db, contract, date(2026, 10, 5))
    assert bank["cycle"] == "2026-10"
    assert bank["hours_assigned"] == 60
    assert bank["hours_consumed"] == 0
    assert bank["hours_remaining"] == 60

    history = hour_bank.history(db, contract)
    assert [item["cycle"] for item in history] == ["2026-10", "2026-09"]


def test_no_se_puede_consumir_en_ciclo_cerrado(contract, db):
    hour_bank.ensure_cycle(db, contract, date(2026, 9, 10))
    db.commit()
    hour_bank.close_expired_cycles(db, today=date(2026, 10, 5))
    db.commit()

    with pytest.raises(hour_bank.CycleClosedError):
        hour_bank.consume(db, contract, 1, ref=date(2026, 9, 20))


def test_mantenimiento_crea_ciclo_vigente(contract, db):
    result = hour_bank.run_maintenance(db, today=date(2026, 10, 20))
    db.commit()
    assert result["created"] == 1
    assert hour_bank.get_bank(db, contract, date(2026, 10, 20))["cycle"] == "2026-10"


def test_registro_de_ajustes(contract, db):
    from app.models.models import HourBankAdjustments

    hour_bank.consume(db, contract, 4.5, note="soporte telefónico", ref=date(2026, 10, 20))
    db.commit()
    adjustments = db.query(HourBankAdjustments).all()
    assert len(adjustments) == 1
    assert float(adjustments[0].hours) == 4.5
    assert adjustments[0].note == "soporte telefónico"
